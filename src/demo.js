// Deliberately synthetic readings, only imported when ?demo=1 is present.
import {FAVORITE,parseSnapshot,parseHistory} from './core.js';
export function example(now=Date.now()) {
  const snapshot=parseSnapshot({dataset:{snapshotAgeSeconds:18,lastCollectionAt:new Date(now-18000).toISOString()},server:{
    id:'example-server',name:FAVORITE,host:'Example address',port:2004,players:128,maxPlayers:128,queue:8,queueMax:50,
    online:true,present:true,joinable:true,scenarioId:'example-scenario',scenarioName:"SH_Kuka's_Everon_II",
    scenarioImageUrl:'https://ar-gcp-cdn.bistudio.com/image/bda0/b353ad558bd96f0d4b112f3b9dad62d67ee3894ffdbf7880edf7e87a356a/135840.jpg',
    modCount:147,platforms:['pc','xbox','psn'],region:'london',version:'1.8.0.13',fps:45,sessionId:'example-session',positionAvgWaitTime:65,
    lastSeen:new Date(now-18000).toISOString()}},now);
  const end=Math.floor(now/300000)*300, rows=[];
  for (let i=0;i<288;i++) {
    const hour=i/12;
    let avg=Math.min(128,Math.max(8,68+60*Math.sin((hour-10)/4)+3*Math.sin(i*.7)));
    if (i>215) avg=126+2*Math.sin(i*.8);
    if (i===259) avg=0;
    if (i===260) avg=32;
    if (i===261) avg=83;
    rows.push({t:end-(287-i)*300,avg,min:Math.max(0,Math.floor(avg-3)),max:Math.min(128,Math.ceil(avg+3)),cap:128});
  }
  const history=parseHistory({points:rows,bucket:'5m'},now);
  return {snapshot,history};
}
