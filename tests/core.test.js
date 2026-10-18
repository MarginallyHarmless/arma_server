import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FAVORITE,matches,pickServer,parseSnapshot,fresh,ageOf,parseHistory,AlertGate,retryDelay,restore,safeImage} from '../src/core.js';
import {ServerApi} from '../src/api.js';
const now=Date.parse('2026-10-18T17:00:00Z');
const row=(changes={})=>({id:'a',name:FAVORITE,online:true,present:true,lastSeen:new Date(now).toISOString(),...changes});
const raw=(changes={},dataset={})=>({server:{...row(),players:100,maxPlayers:128,queue:4,queueMax:50,joinable:true,sessionId:'session-a',scenarioId:'map-a',...changes},dataset:{snapshotAgeSeconds:10,...dataset}});
const snap=(changes={},at=now)=>parseSnapshot(raw({lastSeen:new Date(at).toISOString(),...changes}),at);
test('favorite matching excludes similarly named EU servers',()=>{
  assert(matches(FAVORITE+' | Crossplay'));assert(matches(FAVORITE.toLowerCase()));assert(!matches(FAVORITE+' 2'));assert(!matches(FAVORITE.replace('EU6','EU5')));
});
test('discovery follows new active listing and ignores old IP',()=>{
  const selected=pickServer([row({id:'old',host:'old',lastSeen:new Date(now-600000).toISOString()}),row({id:'new',host:'new'})],now);
  assert.equal(selected.id,'new');
});
test('discovery refuses ambiguous or absent identity',()=>{
  assert.throws(()=>pickServer([row(),row({id:'b'})],now),/More than one/);assert.throws(()=>pickServer([],now),/missing/);
  assert.equal(pickServer([row({online:false})],now).online,false);
});
test('unknown counts stay unknown while zero remains zero',()=>{
  const s=snap({players:null,queue:0});assert.equal(s.players,null);assert.equal(s.queue,0);
  assert.equal(snap({queue:'0'}).queue,null);assert.equal(snap({players:false}).players,null);
});
test('source age preserves fractional API age and gets older',()=>{
  const s=parseSnapshot(raw({}, {snapshotAgeSeconds:45.75}),now);
  assert.equal(ageOf(s,now),45750);assert.equal(ageOf(s,now+10000),55750);assert(fresh(s,now));assert(!fresh(s,now+180000));
});
test('unknown, future, provider-stale and missing presence pause freshness',()=>{
  assert(!fresh(parseSnapshot({server:row({lastSeen:null})},now),now));
  assert(!fresh(snap({lastSeen:new Date(now+120000).toISOString()}),now));
  assert(!fresh(parseSnapshot(raw({}, {stale:true}),now),now));assert(!fresh(snap({present:false}),now));
});
test('identity and artwork are validated',()=>{
  assert.throws(()=>parseSnapshot(raw({name:'different server'}),now),/identity/);
  assert.equal(safeImage('javascript:alert(1)'),null);assert.equal(safeImage('https://unknown.example/map.jpg'),null);
  const metadata=snap({gameVersion:'1.8.0.13',supportedClients:['PLATFORM_PC','PLATFORM_XBL','PLATFORM_PSN']});
  assert.equal(metadata.version,'1.8.0.13');assert.deepEqual(metadata.platforms,['pc','xbox','psn']);
});
test('history preserves decimals and does not replace missing data with zero',()=>{
  const h=parseHistory({points:[{t:1700000000,avg:null,min:0,max:3,cap:128},{t:1700000300,avg:42.5,cap:128},{t:1700000600,avg:0,cap:128}]},now);
  assert.equal(h.points.length,2);assert.equal(h.points[0].avg,42.5);assert.equal(h.points[1].avg,0);
  assert.throws(()=>parseHistory({points:[{t:1700000000,avg:8,min:20,cap:128}]},now),/valid/);
});
test('queue alerts have hysteresis, cooldown and do not rearm on stale readings',()=>{
  const g=new AlertGate(),p={enabled:true,threshold:5};assert(g.check(snap(),p,now));assert(!g.check(snap(),p,now));
  assert(!g.check(snap({queue:10,present:false},now+600000),p,now+600000));assert(!g.check(snap({},now+600000),p,now+600000));
  g.check(snap({queue:10},now+660000),p,now+660000);assert(g.check(snap({},now+720000),p,now+720000));
});
test('empty queue requires an open slot; unavailable data cannot alert',()=>{
  const p={enabled:true,threshold:5};
  for (const change of [{queue:0,players:128},{queue:null},{queue:0,players:null},{online:false},{joinable:false},{present:false}]) assert(!new AlertGate().check(snap(change),p,now));
  assert(new AlertGate().check(snap({queue:0,players:127}),p,now));
});
test('retry delays honor both Retry-After formats beyond normal backoff cap',()=>{
  assert.equal(retryDelay(0,null,now),60000);assert.equal(retryDelay(8,null,now),900000);
  assert.equal(retryDelay(1,'3600',now),3600000);assert.equal(retryDelay(0,new Date(now+3600000).toUTCString(),now),3600000);
});
test('saved state is bounded and rejects invalid data',()=>{
  assert.equal(restore('bad').prefs.enabled,false);
  const restored=restore(JSON.stringify({version:1,prefs:{threshold:999,enabled:'true',range:'forever'},history:[{t:now/1000,avg:0,min:0,max:0,cap:128,sourceId:'a'},{t:now/1000,avg:-1}],session:{id:'bad',first:now,last:now+1000000}}),now);
  assert.equal(restored.prefs.threshold,50);assert.equal(restored.prefs.range,'24h');assert(!restored.prefs.enabled);assert.equal(restored.history.length,1);assert(!restored.session);
});
test('API rediscovery follows a changing ID on each minute check',async()=>{
  let id='a';const calls=[];
  const api=new ServerApi('https://example.test/v2/',async url=>{
    calls.push(url);return Response.json(url.includes('?search=') ? {data:[row({id})]} : raw({id}));
  },()=>now);
  assert.equal((await api.snapshot()).id,'a');id='b';assert.equal((await api.snapshot()).id,'b');assert.equal(calls.filter(u=>u.includes('?search=')).length,2);
});
test('rate limit blocks subsequent metadata calls',async()=>{
  let count=0;const api=new ServerApi('https://example.test/v2/',async()=>{count++;return new Response('',{status:429,headers:{'Retry-After':'120'}});},()=>now);
  await assert.rejects(api.get('servers'),{status:429});await assert.rejects(api.get('servers'),/rate limit/i);assert.equal(count,1);assert.equal(api.blockedUntil,now+120000);
});
test('a disappeared detail listing is rediscovered once',async()=>{
  let searches=0;const api=new ServerApi('https://example.test/v2/',async url=>{
    if (url.includes('?search=')) return Response.json({data:[row({id:++searches===1?'old':'new'})]});
    return url.endsWith('/old') ? new Response('',{status:404}) : Response.json(raw({id:'new'}));
  },()=>now);
  assert.equal((await api.snapshot()).id,'new');assert.equal(searches,2);
});
