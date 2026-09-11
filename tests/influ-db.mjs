import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {onRequest,validState} from '../functions/influ/api/state.js';
const crypto=webcrypto;
const folder=mkdtempSync(join(tmpdir(),'influ-db-')),db=join(folder,'test.sqlite');
function sql(query,params=[],script=false){const p=spawnSync('python3',['-c',`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row
q,p,s=json.load(sys.stdin)
if s:c.executescript(q);v=None
else:
 r=c.execute(q,p).fetchone();v=dict(r) if r else None
c.commit();print(json.dumps(v))`,db],{input:JSON.stringify([query,params,script]),encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout);}
sql(readFileSync(new URL('../influ/migrations/0001_team.sql',import.meta.url),'utf8'),[],true);
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
const env={INFLU_DB:{prepare(q){return{bind(...args){return{first:async()=>sql(q,args)}}}}},INFLU_ACCESS_ISSUER:'https://test-team.cloudflareaccess.com',INFLU_ACCESS_AUD:'fixture-audience',CF_PAGES_BRANCH:'dev'};
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function token(overrides={}){const h=b64({alg:'RS256',kid:'test-key'}),p=b64({iss:env.INFLU_ACCESS_ISSUER,aud:[env.INFLU_ACCESS_AUD],exp:Date.now()/1000+300,sub:'fixture-user',...overrides});return h+'.'+p+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p))).toString('base64url');}
const good=await token();
const state={version:3,records:[],projects:[{id:'p1',name:'Fixture',scope:'',brief:'',budget:null,provinces:[],shortlist:[],offers:{}}],activeProject:'p1'};
function call(method='GET',body,auth=good,origin='https://test.example',e=env){return onRequest({env:e,request:new Request('https://test.example/influ/api/state',{method,headers:{'Cf-Access-Jwt-Assertion':auth,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})});}
let n=0;async function test(name,f){await f();console.log('PASS '+name);n++;}
try{
 await test('missing binding fails closed',async()=>assert.equal((await call('GET',undefined,good,undefined,{...env,INFLU_DB:null})).status,503));
 await test('unsigned token denied',async()=>assert.equal((await call('GET',undefined,'not-a-token')).status,401));
 await test('wrong audience denied',async()=>assert.equal((await call('GET',undefined,await token({aud:['other']}))).status,401));
 await test('expired token denied',async()=>assert.equal((await call('GET',undefined,await token({exp:1}))).status,401));
 await test('new database is empty, not seeded',async()=>{const d=await(await call()).json();assert.equal(d.state,null);assert.equal(d.revision,0);});
 await test('cross-origin write denied',async()=>assert.equal((await call('PUT',{revision:0,state},good,'https://evil.example')).status,403));
 await test('initial save persists in real SQLite',async()=>{assert.equal((await call('PUT',{revision:0,state})).status,200);assert.deepEqual((await(await call()).json()).state,state);});
 await test('competing initial save cannot replace data',async()=>assert.equal((await call('PUT',{revision:0,state})).status,409));
 await test('revision update succeeds once',async()=>assert.equal((await call('PUT',{revision:1,state})).status,200));
 await test('stale write rejected atomically',async()=>assert.equal((await call('PUT',{revision:1,state})).status,409));
 await test('production and preview data are isolated',async()=>assert.equal((await(await call('GET',undefined,good,undefined,{...env,CF_PAGES_BRANCH:'main'})).json()).state,null));
 await test('invalid state rejected',async()=>assert.equal((await call('PUT',{revision:2,state:{...state,activeProject:'missing'}})).status,400));
 await test('large body rejected before SQL',async()=>assert.equal((await call('PUT',{padding:'x'.repeat(1000001)})).status,413));
 await test('search cache is separate and untouched',async()=>assert.equal(sql('SELECT count(*) AS n FROM influ_search_cache').n,0));
 await test('migration is repeatable and preserves data',async()=>{sql(readFileSync(new URL('../influ/migrations/0001_team.sql',import.meta.url),'utf8'),[],true);assert.equal((await(await call()).json()).revision,2);});
 assert.equal(validState(state),true);console.log(`${n} database checks passed (signed test JWTs + real SQLite, no deployed D1).`);
}finally{globalThis.fetch=originalFetch;rmSync(folder,{recursive:true,force:true});}
