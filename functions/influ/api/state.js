// Manual-entry team database. No paid APIs. Reject stale writes atomically.
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const MAX_BYTES=1000000;
let keyCache={issuer:'',until:0,keys:[]};
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function authenticate(request,env){
 const issuer=env.INFLU_ACCESS_ISSUER, audience=env.INFLU_ACCESS_AUD;
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience)return false;
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>20000)return false;
 try{
  const parts=token.split('.');if(parts.length!==3)return false;
  const h=JSON.parse(new TextDecoder().decode(decode(parts[0]))),p=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
  if(h.alg!=='RS256'||typeof h.kid!=='string'||p.iss!==issuer||!Array.isArray(p.aud)||!p.aud.includes(audience)||!Number.isFinite(p.exp)||p.exp<=now||(p.nbf!==undefined&&(!Number.isFinite(p.nbf)||p.nbf>now))||typeof p.sub!=='string'||!p.sub)return false;
  if(keyCache.issuer!==issuer||keyCache.until<Date.now()){
   const response=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(8000)});if(!response.ok)return false;
   const data=await response.json();if(!Array.isArray(data.keys))return false;
   keyCache={issuer,until:Date.now()+300000,keys:data.keys};
  }
  const jwk=keyCache.keys.find(k=>k.kid===h.kid&&k.kty==='RSA');if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false;}
}
const text=(v,n)=>typeof v==='string'&&v.length<=n;
const number=v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0);
const date=v=>text(v,10)&&(v===''||/^\d{4}-\d{2}-\d{2}$/.test(v));
const list=(v,n,max)=>Array.isArray(v)&&v.length<=n&&v.every(x=>text(x,max)&&x.trim());
const url=v=>{try{const u=new URL(v);return text(v,3000)&&['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
export function validState(s){
 if(!s||s.version!==3||!Array.isArray(s.records)||s.records.length>10000||!Array.isArray(s.projects)||!s.projects.length||s.projects.length>1000)return false;
 const ids=new Set(),urls=new Set(),pids=new Set();
 for(const r of s.records){
  if(!r||!text(r.id,200)||!r.id||ids.has(r.id)||!text(r.name,150)||!r.name.trim()||!['pending','reviewed'].includes(r.status)||!list(r.tags,50,250)||!text(r.province,100)||!list(r.serviceProvinces,100,100)||!text(r.source,1500)||!text(r.note,2000)||!text(r.handle,150)||!['manual','public'].includes(r.origin)||!url(r.url)||!['Facebook','Instagram','TikTok','YouTube'].includes(r.platform)||!number(r.followers)||(r.followers!==null&&!Number.isInteger(r.followers))||!date(r.date))return false;
  ids.add(r.id);const platforms=new Set();
  if(!Array.isArray(r.channels)||!r.channels.length||r.channels.length>4)return false;
  for(const c of r.channels){if(!c||!['Facebook','Instagram','TikTok','YouTube'].includes(c.platform)||platforms.has(c.platform)||!url(c.url)||!number(c.followers)||(c.followers!==null&&!Number.isInteger(c.followers))||!date(c.date))return false;platforms.add(c.platform);const k=c.url.replace(/\/$/,'').toLowerCase();if(urls.has(k))return false;urls.add(k);}
  const ref=r.reference;if(!ref||!number(ref.amount)||!text(ref.type,150)||!text(ref.source,1500)||!date(ref.date)||(ref.amount!==null&&(!ref.type.trim()||!ref.source.trim()||!ref.date)))return false;
 }
 for(const p of s.projects){
  if(!p||!text(p.id,200)||!p.id||pids.has(p.id)||!text(p.name,160)||!p.name.trim()||!text(p.scope,2000)||!text(p.brief,2000)||!list(p.provinces,100,100)||!number(p.budget)||!Array.isArray(p.shortlist)||new Set(p.shortlist).size!==p.shortlist.length||!p.shortlist.every(id=>ids.has(id))||!p.offers||typeof p.offers!=='object'||Array.isArray(p.offers))return false;pids.add(p.id);
  for(const [id,o] of Object.entries(p.offers)){if(!ids.has(id)||!o||!['low','high','quote'].every(k=>number(o[k]))||((o.low===null)!==(o.high===null))||(o.low!==null&&o.low>o.high)||!text(o.source,1500)||!date(o.date)||!['unknown','yes','no'].includes(o.travel))return false;}
 }
 return pids.has(s.activeProject);
}
export async function onRequest({request,env}){
 if(!['GET','PUT'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(!env.INFLU_DB||!env.INFLU_ACCESS_ISSUER||!env.INFLU_ACCESS_AUD||!env.CF_PAGES_BRANCH)return json({configured:false,error:'not_configured'},503);
 if(!await authenticate(request,env))return json({error:'login_required'},401);
 const branch=env.CF_PAGES_BRANCH,space=branch==='main'?'production':branch==='dev'?'development':'preview:'+branch;
 if(request.method==='GET'){
  try{const row=await env.INFLU_DB.prepare('SELECT revision, payload, updated_at FROM influ_team_state WHERE namespace = ?').bind(space).first();return json({configured:true,revision:row?.revision||0,state:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||null});}catch{return json({error:'database_unavailable'},503);}
 }
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'origin_rejected'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'json_required'},415);
 // Stream limit, rather than trusting Content-Length.
 const reader=request.body?.getReader();if(!reader)return json({error:'bad_request'},400);
 let size=0,chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'too_large'},413);}chunks.push(value);}
 let body;try{const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'bad_json'},400);}
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!validState(body.state))return json({error:'invalid_state'},400);
 try{
  const payload=JSON.stringify(body.state),at=new Date().toISOString();let row;
  if(body.revision===0)row=await env.INFLU_DB.prepare('INSERT INTO influ_team_state(namespace, revision, payload, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(namespace) DO NOTHING RETURNING revision').bind(space,payload,at).first();
  else row=await env.INFLU_DB.prepare('UPDATE influ_team_state SET revision = revision + 1, payload = ?, updated_at = ? WHERE namespace = ? AND revision = ? RETURNING revision').bind(payload,at,space,body.revision).first();
  if(!row)return json({error:'conflict'},409);
  return json({configured:true,revision:row.revision,updatedAt:at});
 }catch{return json({error:'database_unavailable'},503);}
}
