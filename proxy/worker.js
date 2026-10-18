// Optional Cloudflare Worker. Only relays the public API routes used by this app.
// No API key is required. ALLOWED_ORIGIN is the origin, without a path or slash.
const UPSTREAM='https://api.reforgermods.net';
const FAVORITE='[EU6] SpearHead CORE KUKAs EVERON';
const UUID='[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';
export function allowedPath(url) {
  const keys=[...url.searchParams.keys()];
  if (new Set(keys).size!==keys.length) return false;
  if (url.pathname==='/v2/servers') return keys.every(k=>['search','includeOffline','perPage','page'].includes(k)) &&
    url.searchParams.get('search')===FAVORITE && url.searchParams.get('includeOffline')==='true' &&
    url.searchParams.get('perPage')==='100' && /^[1-5]$/.test(url.searchParams.get('page') || '');
  if (new RegExp(`^/v2/servers/${UUID}/history$`).test(url.pathname)) return keys.length===1 && keys[0]==='range' && ['6h','24h','7d'].includes(url.searchParams.get('range'));
  return !url.search && (new RegExp(`^/v2/servers/${UUID}$`).test(url.pathname) || /^\/v2\/mods\/[a-fA-F0-9]{16}\/scenarios$/.test(url.pathname));
}
export async function handle(request, env, fetcher=fetch) {
  const origin=request.headers.get('Origin'), allowed=env.ALLOWED_ORIGIN;
  if (!allowed) return new Response('Set ALLOWED_ORIGIN to your GitHub Pages origin.',{status:503});
  if (origin!==allowed) return new Response('Origin not allowed.',{status:403});
  const headers=new Headers({'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Access-Control-Expose-Headers':'Retry-After','Cache-Control':'no-store','Content-Type':'application/json'});
  if (!allowedPath(new URL(request.url))) return new Response('{"error":"Route not allowed"}',{status:404,headers});
  if (request.method==='OPTIONS') {
    headers.set('Access-Control-Allow-Methods','GET, OPTIONS');headers.set('Access-Control-Allow-Headers','Accept');headers.set('Access-Control-Max-Age','86400');
    return new Response(null,{status:204,headers});
  }
  if (request.method!=='GET') return new Response('{"error":"Method not allowed"}',{status:405,headers});
  const url=new URL(request.url);
  try {
    const response=await fetcher(UPSTREAM+url.pathname+url.search,{method:'GET',headers:{Accept:'application/json','X-API-Client':'SpearHeadWeb/1.0'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if (response.headers.has('Retry-After')) headers.set('Retry-After',response.headers.get('Retry-After'));
    // Do not forward upstream cookies, credentials or unrelated headers.
    return new Response(response.body,{status:response.status,headers});
  } catch {return new Response('{"error":"Upstream unavailable"}',{status:502,headers});}
}
export default {fetch(request,env) { return handle(request,env); }};
