import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath,handle} from '../proxy/worker.js';
const origin='https://marginallyharmless.github.io',env={ALLOWED_ORIGIN:origin};
const path='/v2/servers/f39a4d0f-fa16-4a30-b6bb-60d82d3e3c5f';
const request=(p=path,options={})=>new Request('https://proxy.example'+p,{headers:{Origin:origin},...options});
test('proxy only permits fixed public API routes and constrained query parameters',()=>{
  for (const p of [path,path+'/history?range=24h','/v2/mods/64D976EE51610B2B/scenarios','/v2/servers?search='+encodeURIComponent('[EU6] SpearHead CORE KUKAs EVERON')+'&includeOffline=true&perPage=100&page=1']) assert(allowedPath(new URL('https://proxy.example'+p)));
  for (const p of ['/admin',path+'?url=https://private.example',path+'/history?range=24h&range=7d','/v2/servers?search=all',path+'/history?range=365d']) assert(!allowedPath(new URL('https://proxy.example'+p)));
});
test('unconfigured or unexpected origins and write methods cannot reach upstream',async()=>{
  const fail=()=>{throw new Error('Should not fetch');};
  assert.equal((await handle(request(),{},fail)).status,503);
  assert.equal((await handle(request(path,{headers:{Origin:'https://evil.example'}}),env,fail)).status,403);
  assert.equal((await handle(request(path,{method:'POST'}),env,fail)).status,405);
});
test('proxy forwards only safe headers, preserves Retry-After and exposes CORS',async()=>{
  let options;
  const result=await handle(request(path,{headers:{Origin:origin,Cookie:'private',Authorization:'secret'}}),env,async(url,opts)=>{
    assert.equal(url,'https://api.reforgermods.net'+path);options=opts;return new Response('{}',{status:429,headers:{'Retry-After':'90','Set-Cookie':'upstream'}});
  });
  assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(result.status,429);
  assert.equal(result.headers.get('Retry-After'),'90');assert.equal(result.headers.get('Set-Cookie'),null);assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
});
test('proxy failures return a readable error with CORS',async()=>{
  const response=await handle(request(),env,async()=>{throw new Error('network failed');});
  assert.equal(response.status,502);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});
