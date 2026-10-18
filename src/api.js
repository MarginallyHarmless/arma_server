import {FAVORITE,pickServer,parseSnapshot,parseHistory,retryDelay} from './core.js';

export class ServerApi {
  constructor(base, fetcher=(...args)=>fetch(...args), clock=Date.now) { this.base=base.replace(/\/?$/,'/'); this.fetcher=fetcher; this.clock=clock; this.blockedUntil=0; }
  async get(path) {
    if (this.clock()<this.blockedUntil) throw new Error('Data service rate limit. Waiting before retrying.');
    let response;
    try { response=await this.fetcher(this.base+path,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(15000)}); }
    catch (cause) { console.warn('Server request failed:',cause?.name,cause?.message); throw new Error('Cannot reach the data service. Retrying automatically.'); }
    if (!response.ok) {
      const error=new Error(response.status===429 ? 'Data service rate limit. Retrying after a delay.' : `The data service returned HTTP ${response.status}.`);
      error.status=response.status;
      if ([429,503].includes(response.status)) this.blockedUntil=this.clock()+retryDelay(0,response.headers.get('Retry-After'),this.clock());
      throw error;
    }
    try { return await response.json(); }
    catch { throw new Error('The data service returned an unreadable response.'); }
  }
  async discover() {
    const rows=[];
    for (let page=1;page<=5;page++) {
      const data=await this.get(`servers?search=${encodeURIComponent(FAVORITE)}&includeOffline=true&perPage=100&page=${page}`);
      if (!Array.isArray(data.data)) throw new Error('The server list is unavailable.');
      rows.push(...data.data);
      const total=Number(data.meta?.totalPages || 1);
      if (total<=page) return pickServer(rows,this.clock()).id;
    }
    throw new Error('The search returned too many listings to choose safely.');
  }
  async snapshot() {
    for (let attempt=0;attempt<2;attempt++) {
      const id=await this.discover();
      try {
        const s=parseSnapshot(await this.get(`servers/${encodeURIComponent(id)}`),this.clock());
        if (s.id !== id) throw new Error('The server identity changed during the request.');
        return s;
      } catch (e) { if (!attempt && (e.status===404 || /identity/.test(e.message))) continue; throw e; }
    }
  }
  async history(id,range) {
    if (!['6h','24h','7d'].includes(range)) throw new Error('Unknown history range.');
    return parseHistory(await this.get(`servers/${encodeURIComponent(id)}/history?range=${range}`),this.clock());
  }
  async mode(s) {
    if (!s.scenarioModId || !s.scenarioId) return null;
    const data=await this.get(`mods/${encodeURIComponent(s.scenarioModId)}/scenarios`);
    const row=data.data?.scenarios?.find(r=>r.gameId===s.scenarioId);
    const mode=row?.gameMode;
    return {'#AR-Campaign_GamemodeName':'Conflict','#AR-Scenario_GameMode_Campaign':'Conflict','#AR-Scenario_GameMode_GameMaster':'Game Master'}[mode] || (typeof mode==='string' && !mode.startsWith('#') ? mode : null);
  }
}
