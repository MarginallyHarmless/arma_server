export const FAVORITE = '[EU6] SpearHead CORE KUKAs EVERON';
export const STORAGE_KEY = 'spearhead-eu6-watch-v1';
export const numeric = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
export const matches = name => typeof name === 'string' &&
  (name.toLowerCase() === FAVORITE.toLowerCase() || name.toLowerCase().startsWith(FAVORITE.toLowerCase() + ' |'));

export function pickServer(rows, now = Date.now()) {
  const named = rows.filter(r => r && matches(r.name));
  const current = named.filter(r => {
    const t = stamp(r.lastSeen);
    return r.online !== false && r.present !== false && (t === null || (now - t <= 180000 && now - t >= -60000));
  });
  if (current.length > 1 || (!current.length && named.length > 1))
    throw new Error('More than one EU6 listing matches. Waiting for a unique current listing; alerts are paused.');
  const result = current[0] || named[0];
  if (!result) throw new Error('EU6 is missing from the server list. It may be restarting or temporarily untracked.');
  if (!result.id || typeof result.id !== 'string') throw new Error('The server listing has no ID.');
  return result;
}

export function parseSnapshot(root, now = Date.now()) {
  const s = root?.server, d = root?.dataset || {};
  if (!s || !matches(s.name)) throw new Error('Could not verify the SpearHead EU6 server identity.');
  const ages = [], times = [stamp(s.lastSeen), stamp(d.lastCollectionAt)].filter(t => t !== null);
  const suppliedAge = numeric(d.snapshotAgeSeconds);
  if (suppliedAge !== null) ages.push(suppliedAge * 1000);
  times.forEach(t => ages.push(Math.max(0, now - t)));
  const age = ages.length ? Math.max(...ages) : null;
  return {
    ...s,
    version: s.gameVersion || s.version,
    platforms: Array.isArray(s.supportedClients) ? s.supportedClients.map(p=>({PLATFORM_PC:'pc',PLATFORM_XBL:'xbox',PLATFORM_PSN:'psn'}[p] || p)) : s.platforms,
    players: numeric(s.players), maxPlayers: numeric(s.maxPlayers), queue: numeric(s.queue), queueMax: numeric(s.queueMax),
    fps: numeric(s.fps), modCount: numeric(s.modCount), positionAvgWaitTime: numeric(s.positionAvgWaitTime),
    scenarioModId: s.scenarioModId || s.hostedScenarioModId,
    imageUrl: safeImage(s.scenarioImageUrl) || safeImage(s.scenarioThumbnailUrl),
    fetchedAt: now, ageAtFetch: age,
    stale: d.stale === true || d.warming === true || s.present === false || times.some(t => t > now + 60000),
  };
}

export function safeImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'ar-gcp-cdn.bistudio.com' ? u.href : null; }
  catch { return null; }
}
export const ageOf = (s, now = Date.now()) => s?.ageAtFetch == null ? null : s.ageAtFetch + Math.max(0, now - s.fetchedAt);
export const fresh = (s, now = Date.now()) => !!s && !s.stale && ageOf(s, now) !== null && ageOf(s, now) <= 180000;
export const observedAt = s => s.fetchedAt - s.ageAtFetch;

export function parseHistory(root, now = Date.now()) {
  const rows = root?.points || root?.data?.points || root?.data;
  if (!Array.isArray(rows)) throw new Error('Population history is unavailable.');
  const points = new Map();
  for (const row of rows) {
    const t = numeric(row?.t), avg = numeric(row?.avg), cap = numeric(row?.cap);
    const min = numeric(row?.min) ?? avg, max = numeric(row?.max) ?? avg;
    if (t === null || t < 946684800 || avg === null || !cap || cap > 100000 || min > avg || max < avg || max > cap) continue;
    points.set(t, { t, avg, min, max, cap, sourceId: null });
  }
  if (rows.length && !points.size) throw new Error('The history response contained no valid readings.');
  return {points: [...points.values()].sort((a,b) => a.t-b.t), fetchedAt: now,
    stale: root?.dataset?.stale === true || root?.dataset?.warming === true, bucket: root?.bucket || null};
}

export function observe(state, s, now = Date.now()) {
  if (!fresh(s,now) || s.online !== true) return {state};
  const t = observedAt(s), next = {...state};
  next.history = (state.history || []).filter(p => p.t >= now/1000-7*86400).slice(-10079);
  const last = next.history.at(-1);
  if (s.players !== null && s.maxPlayers > 0 && s.players <= s.maxPlayers && (!last || t/1000 > last.t+10))
    next.history.push({t:t/1000,avg:s.players,min:s.players,max:s.players,cap:s.maxPlayers,sourceId:s.id});
  return {state:next};
}

export class AlertGate {
  armed=true; last=-Infinity;
  check(s, {enabled,threshold}, now=Date.now()) {
    if (!enabled) { this.armed=true; return false; }
    if (!fresh(s,now) || s.online !== true || s.joinable !== true || s.queue === null) return false;
    const eligible = s.queue <= threshold && (s.queue !== 0 || (s.players !== null && s.maxPlayers > s.players));
    if (!eligible) { this.armed=true; return false; }
    if (!this.armed || now-this.last < 600000) return false;
    this.armed=false; this.last=now; return true;
  }
}

export function retryDelay(attempt, retryAfter, now=Date.now()) {
  const parsed = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-now) : 0;
  return Math.max(Math.min(900000,60000*2**Math.min(attempt,4)), Number.isFinite(parsed) ? parsed : 0);
}

export function duration(ms) {
  if (!Number.isFinite(ms)) return 'Unknown';
  const minutes=Math.max(0,Math.floor(ms/60000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes/60)}h ${minutes%60}m`;
  return `${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`;
}

export function restore(raw, now=Date.now()) {
  const base={prefs:{enabled:false,threshold:5,sound:false,range:'24h'},history:[]};
  try {
    const value=JSON.parse(raw);
    if (!value || value.version !== 1) return base;
    for (const key of ['enabled','sound']) base.prefs[key]=value.prefs?.[key] === true;
    const threshold=value.prefs?.threshold;
    if (Number.isInteger(threshold)) base.prefs.threshold=Math.max(0,Math.min(50,threshold));
    if (['6h','24h','7d'].includes(value.prefs?.range)) base.prefs.range=value.prefs.range;
    const rows=Array.isArray(value.history) ? value.history : [];
    base.history=rows.filter(p => p && [p.t,p.avg,p.min,p.max,p.cap].every(v=>numeric(v)!==null) && p.cap>0 && p.cap<=100000 && p.min<=p.avg && p.avg<=p.max && p.max<=p.cap && p.t>=now/1000-7*86400 && p.t<=now/1000+60 && typeof p.sourceId==='string').sort((a,b)=>a.t-b.t).slice(-10080);
  } catch { /* A bad or blocked local store must not prevent monitoring. */ }
  return base;
}
