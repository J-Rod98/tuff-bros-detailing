import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {receptionistTurn,intakeKeys,validateTurn,publicCatalog} from '../netlify/functions/lib/receptionist-core.mjs';
const stores=new Map();let version=0;
function getStore({name}){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {async get(k){return structuredClone(m.get(k)?.data||null)},async getWithMetadata(k){return structuredClone(m.get(k)||null)},async setJSON(k,data,o={}){const old=m.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch&&old?.etag!==o.onlyIfMatch)return {modified:false};m.set(k,{data:structuredClone(data),etag:String(++version)});return {modified:true};},async delete(k){m.delete(k)},list({prefix=''}={}){return(async function*(){yield {blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}})()}}}
mock.module('@netlify/blobs',{namedExports:{getStore}});
const {receptionistBridge,respond,pauseConversation,readConfig,voiceXml}=await import('../netlify/functions/lib/receptionist.mjs');
const {validTwilio,default:phoneAPI}=await import('../netlify/functions/receptionist-phone.mjs');
const origin='https://tuffbrosdetailing.com';process.env.URL=origin;process.env.BOOKING_SESSION_SECRET='local-disposable-secret-with-32-characters';
const turn=(extra={})=>({reply:'What year, make and model is your vehicle?',summary:'Customer requests an interior clean. Vehicle and address are missing.',needsHuman:false,reason:'',intake:Object.fromEntries(intakeKeys.map(k=>[k,''])),...extra});
const ai=body=>async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(body)}]}]}),{headers:{'Content-Type':'application/json'}});
const owner=(path,method='GET')=>new Request(origin+'/.netlify/functions/os-bridge/receptionist/'+path,{method});
test('structured AI uses only public catalog/context and rejects provider failures and invented commitments',async()=>{
 let seen;const r=await receptionistTurn({apiKey:'disposable',message:'Please clean my SUV',catalog:publicCatalog([{name:'Full detail',price:200}]),fetcher:async(u,o)=>{seen=JSON.parse(o.body);return ai(turn())()}});assert.equal(r.needsHuman,false);assert.equal(seen.store,false);assert.equal(seen.text.format.strict,true);assert.equal(seen.input[0].content.includes('Full detail'),true);
 for(const reply of ['You are booked for tomorrow.','That costs $99.','We guarantee removal.'])assert.throws(()=>validateTurn(turn({reply})));
 await assert.rejects(()=>receptionistTurn({apiKey:'x',message:'Hi',fetcher:async()=>new Response('{}',{status:429})}));
});
test('complaints bypass AI and require personal review without promises or API calls',async()=>{let called=false;const r=await receptionistTurn({apiKey:'',message:'I need a refund for damage',fetcher:async()=>{called=true}});assert.equal(called,false);assert.equal(r.needsHuman,true);assert.match(r.reply,/Jonathan/)});
test('config is encrypted, disabled by default and phone cannot enable without provider credentials',async()=>{
 assert.equal((await readConfig()).websiteEnabled,false);
 const bad=await receptionistBridge(owner('config','POST'),{websiteEnabled:false,phoneEnabled:true,catalog:[]});assert.equal(bad.status,422);
 const saved=await receptionistBridge(owner('config','POST'),{websiteEnabled:true,phoneEnabled:false,apiKey:'private-test-key',catalog:[]});assert.equal(saved.status,200);assert.equal((await saved.text()).includes('private-test-key'),false);assert.equal(JSON.stringify([...stores.get('tuffbros-receptionist').values()]).includes('private-test-key'),false);
});
test('retries publish one reply and one receipt, preserve contact, and owner takeover stops AI',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return ai(turn())()};
 try{const args={id:'a'.repeat(64),eventId:crypto.randomUUID(),message:'Interior clean please',phone:'5015550100',name:'Test customer'};const a=await respond(args),b=await respond(args);assert.equal(a.id,b.id);assert.equal(calls,1);assert.equal(stores.get('tuffbros-os-replies').size,1);assert.equal(stores.get('tuffbros-os-events').size,1);assert.equal([...stores.get('tuffbros-os-events').values()][0].data.phone,'5015550100');await assert.rejects(()=>respond({...args,message:'Changed body'}));await pauseConversation(args.id);const next=await respond({...args,eventId:crypto.randomUUID(),message:'Are you there?'});assert.equal(next.handoff,true);assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('simultaneous messages cannot generate overlapping replies',async()=>{
 let release;const waiting=new Promise(r=>release=r),original=globalThis.fetch;globalThis.fetch=async()=>{await waiting;return ai(turn())()};
 try{const args={id:'b'.repeat(64),eventId:crypto.randomUUID(),message:'Hello',phone:'5015550101'};const first=respond(args);await new Promise(r=>setTimeout(r,10));await assert.rejects(()=>respond({...args,eventId:crypto.randomUUID()}));release();await first;}finally{globalThis.fetch=original}
});
test('voice webhooks validate signatures, account/number and escape spoken customer content',async()=>{
 const params=new URLSearchParams({AccountSid:'AC'+'1'.repeat(32),To:'+15015550100',From:'+15015550101',CallSid:'CA'+'2'.repeat(32)}),url=origin+'/.netlify/functions/receptionist-phone';
 let signed=url;for(const k of [...params.keys()].sort())signed+=k+params.get(k);const sig=crypto.createHmac('sha1','test-token').update(signed).digest('base64');const request=new Request(url,{method:'POST',body:params,headers:{'x-twilio-signature':sig}});assert.equal(validTwilio(request,params,'test-token'),true);assert.equal(validTwilio(request,params,'wrong'),false);assert.equal((await phoneAPI(new Request(url,{method:'POST',body:params}))).status,403);
 assert.match(voiceXml('<script>&',url),/&lt;script&gt;&amp;/);assert.match(voiceXml('Done',url,{end:true}),/<Hangup\/>/);
});
