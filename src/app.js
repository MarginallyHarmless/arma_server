import config from '../config.js';
import {STORAGE_KEY,restore,ageOf,fresh,observe,AlertGate,duration,retryDelay} from './core.js';
import {ServerApi} from './api.js';

const $=id=>document.getElementById(id), text=(id,value)=>{$(id).textContent=value;};
const demo=new URLSearchParams(location.search).get('demo')==='1';
const interval=Math.max(60000,(Number(config.refreshSeconds)||60)*1000);
const api=new ServerApi(config.apiBase), gate=new AlertGate();
let state, storageOK=true;
try { state=restore(demo ? null : localStorage.getItem(STORAGE_KEY)); } catch { state=restore(null); storageOK=false; }
let snapshot=null, busy=false, nextDue=Date.now(), failures=0, statusError='', historyError='', mode=null;
let lastAttempt=0, historyBusy=false, modeKey='', modeTried=0, shownImage='', chartPoints=[], activeSeries=null;
const histories=new Map();
let audioContext;
const number=v=>v===null || v===undefined ? '—' : Math.round(v).toLocaleString();
const time=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const dateTime=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const currentRange=()=>state.prefs.range;

function save() {
  if (demo) return;
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,...state})); }
  catch { storageOK=false; }
  text('storage-note',storageOK ? '' : 'Browser storage is unavailable. Settings and local observations will only last for this visit.');
}
function toast(message) {
  text('toast',message); $('toast').hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').hidden=true,12000);
}
function prepareAudio() {
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(()=>{}); } catch { /* optional */ }
}
function notify(message) {
  if (demo) return;
  toast(message);
  if ('Notification' in window && Notification.permission==='granted') {
    try { new Notification('SpearHead EU6',{body:message,icon:new URL('../icon.svg',import.meta.url).href,tag:'spearhead-eu6'}); } catch { /* In-page alert remains visible. */ }
  }
  if (state.prefs.sound && audioContext?.state==='running') {
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=660;
    gain.gain.setValueAtTime(.07,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.6);
    oscillator.start();oscillator.stop(audioContext.currentTime+.6);
  }
}
function queueAlert() {
  if (!statusError && gate.check(snapshot,state.prefs)) notify(snapshot.queue===0 ? 'The queue is empty and a player slot is open.' : `The queue is down to ${snapshot.queue} people.`);
}
function setPrefs() {
  $('alerts').checked=state.prefs.enabled; $('sound').checked=state.prefs.sound;
  // Older stored thresholds can be any integer, not just the quick choices.
  if (![...$('threshold').options].some(o=>Number(o.value)===state.prefs.threshold)) $('threshold').add(new Option(String(state.prefs.threshold),String(state.prefs.threshold)));
  $('threshold').value=String(state.prefs.threshold);
  document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===currentRange())));
  const supported='Notification' in window;
  $('notifications').disabled=demo || !supported || Notification.permission==='granted';
  text('notifications',demo ? 'Notifications disabled in preview' : !supported ? 'Browser notifications unavailable' : Notification.permission==='granted' ? 'Browser notifications enabled' : 'Enable browser notifications');
}

function renderStatus() {
  const now=Date.now(), isFresh=fresh(snapshot,now), age=ageOf(snapshot,now);
  let label='Connecting', kind='';
  if (statusError) {label='Connection issue';kind='warn';}
  else if (snapshot) {
    if (snapshot.online===false) {label='Offline';kind='offline';}
    else if (!isFresh) {label='Stale data';kind='warn';}
    else if (snapshot.online===true) label='Online';
    else {label='Status unknown';kind='warn';}
  }
  if (demo) label='Example data';
  $('status').className='pill '+kind;text('status-text',label);
  text('freshness',snapshot ? (age===null ? 'Source freshness unknown' : `Source reading ${age<60000 ? Math.floor(age/1000)+'s' : duration(age)} ago`) : 'Waiting for a first reading');
  const warning=statusError || (snapshot && !isFresh ? 'These are the last reported values. Fresh data is unavailable, so alerts are paused.' : '');
  $('message').hidden=!warning;text('message',warning);
  text('countdown',demo ? 'Preview · no live requests' : busy ? 'Checking server…' : document.hidden ? 'Checks resume on return' : `Next check in ${Math.max(0,Math.ceil((nextDue-now)/1000))}s`);
  $('refresh').disabled=busy || (!demo && (now-lastAttempt<10000 || now<api.blockedUntil));
  document.title=demo ? 'Example · SpearHead server watch' : snapshot && !statusError && isFresh ? `${number(snapshot.players)}/${number(snapshot.maxPlayers)} · Q ${number(snapshot.queue)} · SpearHead` : 'SpearHead · Server watch';
}
function renderSnapshot() {
  const s=snapshot;
  if (!s) return;
  text('players',number(s.players));text('capacity',' / '+number(s.maxPlayers));text('queue',number(s.queue));text('queue-capacity',s.queueMax===null ? '' : ' / '+number(s.queueMax));
  const percentage=s.players!==null && s.maxPlayers ? Math.min(100,100*s.players/s.maxPlayers) : 0;
  $('occupancy').style.width=percentage+'%'; $('occupancy').parentElement.setAttribute('aria-label',`${number(s.players)} of ${number(s.maxPlayers)} player slots occupied`);
  text('player-note',s.players!==null && s.maxPlayers ? (s.players>=s.maxPlayers ? 'Server is full' : `${number(Math.max(0,s.maxPlayers-s.players))} player slots open`) : 'Player count unavailable');
  text('queue-note',s.queue===null ? 'Queue information unavailable' : s.queue===0 ? 'No one waiting to join' : 'Total waiting to join');
  text('scenario',s.scenarioName || 'Scenario not reported');text('mode',mode || 'Arma Reforger');
  const platforms=Array.isArray(s.platforms) ? s.platforms.map(p=>({pc:'PC',xbox:'Xbox',psn:'PlayStation'}[p] || String(p))).join(' · ') : '';
  text('platforms',platforms || 'Platforms unavailable');text('mods',s.modCount!==null ? `${number(s.modCount)} mods` : 'Mods unavailable');
  if (shownImage!==s.imageUrl) {
    shownImage=s.imageUrl;
    $('map-image').hidden=true;$('image-placeholder').hidden=false;
    if (s.imageUrl) {
      $('map-image').onload=()=>{ $('map-image').hidden=false;$('image-placeholder').hidden=true; };
      $('map-image').onerror=()=>{ $('map-image').hidden=true;$('image-placeholder').hidden=false; };
      $('map-image').src=s.imageUrl;
    } else $('map-image').removeAttribute('src');
  }
  text('address',s.host && s.port ? `${s.host}:${s.port}` : 'Not reported');text('region',s.region || 'Not reported');text('version',s.version || 'Not reported');
  text('fps',s.fps===null ? 'Not reported' : number(s.fps));text('session',s.sessionId || 'Not reported');
  text('wait',s.positionAvgWaitTime===null ? 'Not reported' : `${number(s.positionAvgWaitTime)} seconds (provider estimate)`);
}

function getSeries() {
  const remote=histories.get(`${snapshot?.id}:${currentRange()}`);
  if (remote?.points.length) return {...remote,local:false};
  const hours={'6h':6,'24h':24,'7d':168}[currentRange()], points=state.history.filter(p=>p.t>=Date.now()/1000-hours*3600);
  return {points,fetchedAt:Date.now(),stale:false,local:true};
}
function drawChart() {
  activeSeries=getSeries(); chartPoints=activeSeries.points;
  const svg=$('chart'), end=Date.now()/1000, hours={'6h':6,'24h':24,'7d':168}[currentRange()], start=end-hours*3600;
  const points=chartPoints.filter(p=>p.t>=start && p.t<=end);
  chartPoints=points;
  const cap=Math.max(1,snapshot?.maxPlayers || 128,...points.map(p=>p.cap));
  const W=Math.max(280,Math.round(svg.clientWidth)),H=svg.clientHeight || 220,left=30,right=9,top=9,bottom=30,innerW=W-left-right,innerH=H-top-bottom;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const x=t=>left+(t-start)/(end-start)*innerW, y=v=>top+innerH*(1-v/cap);
  let html='';
  for (const fraction of [0,.5,1]) {
    const yy=y(cap*fraction);html+=`<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#34402f" stroke-dasharray="3 5"/><text x="0" y="${yy+4}">${Math.round(cap*fraction)}</text>`;
  }
  for (let i=0;i<=4;i++) {
    const t=start+(end-start)*i/4, label=hours>24 ? new Date(t*1000).toLocaleDateString([],{month:'short',day:'numeric'}) : time(t*1000);
    html+=`<text x="${x(t)}" y="${H-5}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${label.replace(/[<>&]/g,'')}</text>`;
  }
  const bucket=/^(\d+)(s|m|h)$/.exec(activeSeries.bucket || '');
  const typical=activeSeries.local ? 60 : bucket ? Number(bucket[1])*({s:1,m:60,h:3600}[bucket[2]]) : hours>24 ? 3600 : 300;
  const segments=[]; let segment=[];
  for (const p of points) {
    const previous=segment.at(-1);
    if (previous && (p.t-previous.t>typical*1.8 || p.sourceId!==previous.sourceId)) {segments.push(segment);segment=[];}
    segment.push(p);
  }
  if (segment.length) segments.push(segment);
  html+='<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b9d8a3" stop-opacity=".15"/><stop offset="1" stop-color="#b9d8a3" stop-opacity="0"/></linearGradient></defs>';
  for (const group of segments) {
    const line=group.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.avg).toFixed(2)}`).join(' ');
    if (group.length>1) {
      const band=group.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.max).toFixed(2)}`).join(' ')+' '+[...group].reverse().map(p=>`L${x(p.t).toFixed(2)},${y(p.min).toFixed(2)}`).join(' ')+'Z';
      html+=`<path d="${line} L${x(group.at(-1).t)},${y(0)} L${x(group[0].t)},${y(0)} Z" fill="url(#area)"/><path d="${band}" fill="#b9d8a3" fill-opacity=".1"/><path d="${line}" fill="none" stroke="#b9d8a3" stroke-width="2" stroke-linejoin="round"/>`;
    } else html+=`<circle cx="${x(group[0].t)}" cy="${y(group[0].avg)}" r="3" fill="#b9d8a3"/>`;
  }
  svg.innerHTML=html;
  svg.setAttribute('aria-label',`Population over ${currentRange()}. ${points.length} readings. ${points.length ? 'Peak '+Math.max(...points.map(p=>p.max))+' players.' : 'No readings available.'}`);
  $('chart-empty').hidden=points.length>0;
  text('chart-empty',historyBusy ? 'Loading population history…' : 'No history available yet.');
  text('peak',points.length ? number(Math.max(...points.map(p=>p.max))) : '—');
  text('average',points.length ? number(points.reduce((sum,p)=>sum+p.avg,0)/points.length) : '—');
  text('low',points.length ? number(Math.min(...points.map(p=>p.min))) : '—');
  const source=activeSeries.local ? 'Readings saved in this browser · only while open' : `API history · ${activeSeries.bucket || 'bucketed'} readings · checked ${time(activeSeries.fetchedAt)}`;
  text('history-note',`${demo?'Example data · ':''}${source}${activeSeries.stale?' · provider marked stale':''}${historyError?' · '+historyError:''}. Gaps remain empty. Shading shows min–max; line shows average.`);
}

async function loadHistories() {
  if (!snapshot || historyBusy || demo || Date.now()<api.blockedUntil) return;
  const id=snapshot.id, ranges=[currentRange()];
  historyBusy=true;historyError='';drawChart();
  try {
    for (const range of ranges) {
      const cached=histories.get(`${id}:${range}`);
      if (cached && Date.now()-cached.fetchedAt<300000) continue;
      const data=await api.history(id,range);
      if (snapshot?.id!==id) return;
      histories.set(`${id}:${range}`,data);
    }
  } catch {historyError='History update unavailable; retrying with the next check';}
  finally {historyBusy=false;drawChart();}
}

async function refresh(manual=false) {
  const now=Date.now();
  if (demo) {renderStatus();return;}
  if (busy || now<api.blockedUntil || (manual && now-lastAttempt<10000)) return;
  busy=true;lastAttempt=now;renderStatus();
  try {
    const incoming=await api.snapshot();
    if (snapshot?.id!==incoming.id) {histories.clear();mode=null;modeKey='';historyError='';}
    snapshot=incoming;statusError='';failures=0;
    state=observe(state,snapshot).state;save();
    renderSnapshot();drawChart();queueAlert();
    await loadHistories();
    const key=`${snapshot.scenarioModId}:${snapshot.scenarioId}`;
    if (key!==modeKey || (!mode && Date.now()-modeTried>3600000)) {
      modeKey=key;mode=null;modeTried=Date.now();
      try {mode=await api.mode(snapshot);} catch { /* Optional metadata must not hide the current status. */ }
      renderSnapshot();
    }
    nextDue=Math.max(lastAttempt+interval,Date.now()+1000,api.blockedUntil);
  } catch (e) {
    statusError=e.message || 'The server could not be checked.';
    nextDue=Math.max(Date.now()+retryDelay(failures++),api.blockedUntil);
  } finally {busy=false;renderStatus();}
}

$('refresh').addEventListener('click',()=>refresh(true));
for (const [id,key] of [['alerts','enabled'],['sound','sound']]) $(id).addEventListener('change',()=>{
  state.prefs[key]=$(id).checked;if (state.prefs.sound) prepareAudio();save();queueAlert();
});
$('threshold').addEventListener('change',()=>{state.prefs.threshold=Number($('threshold').value);save();queueAlert();});
$('notifications').addEventListener('click',async()=>{
  if (demo || !('Notification' in window)) return;
  try { const result=await Notification.requestPermission();toast(result==='granted' ? 'Browser notifications are ready. Enable queue alerts to receive notifications.' : 'Browser notifications are blocked. In-page alerts still work. You can change this in your browser’s site settings.'); }
  catch { toast('This browser could not enable notifications. In-page alerts still work.'); }
  setPrefs();
});
document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{
  state.prefs.range=button.dataset.range;save();setPrefs();drawChart();loadHistories();
}));
$('chart').addEventListener('pointermove',event=>{
  if (!chartPoints.length) return;
  const rect=$('chart').getBoundingClientRect(), hours={'6h':6,'24h':24,'7d':168}[currentRange()];
  const fraction=Math.max(0,Math.min(1,(event.clientX-rect.left-30)/(rect.width-39)));
  const target=Date.now()/1000-hours*3600*(1-fraction);
  const point=chartPoints.reduce((best,p)=>Math.abs(p.t-target)<Math.abs(best.t-target)?p:best);
  const maxDistance=activeSeries.local ? 180 : hours>24 ? 5400 : 450;
  if (Math.abs(point.t-target)>maxDistance) {$('chart-tooltip').hidden=true;return;}
  text('chart-tooltip',`${dateTime(point.t*1000)}\nAverage ${Math.round(point.avg*10)/10} · Min ${point.min} · Max ${point.max}`);
  $('chart-tooltip').hidden=false;
});
$('chart').addEventListener('pointerleave',()=>$('chart-tooltip').hidden=true);
document.addEventListener('visibilitychange',()=>{if (!document.hidden && Date.now()>=nextDue) refresh();renderStatus();});
window.addEventListener('online',()=>{if (!document.hidden && Date.now()-lastAttempt>=10000) refresh();});
new ResizeObserver(()=>drawChart()).observe($('chart'));
setPrefs();save();drawChart();
if (demo) {
  const {example}=await import('./demo.js'), data=example();snapshot=data.snapshot;mode='Conflict';
  for (const range of ['6h','24h','7d']) histories.set(`${snapshot.id}:${range}`,data.history);
  $('demo-banner').hidden=false;renderSnapshot();drawChart();renderStatus();
} else refresh();
setInterval(()=>{renderStatus();if (!demo && !document.hidden && Date.now()>=nextDue) refresh();},1000);
