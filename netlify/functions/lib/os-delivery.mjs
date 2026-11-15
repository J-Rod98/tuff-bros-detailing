import {writeJSON,eventHash} from './blob-json.mjs';
import crypto from 'node:crypto';
import {bookingStore,json} from './booking-security.mjs';
const storage=()=>bookingStore('os-delivery');
const queue=()=>bookingStore('os-events');
const OS='https://tuff-bros-ops-demo.jon131919.chatgpt.site';
function key(){if((process.env.BOOKING_SESSION_SECRET||'').length<32)throw Error('Secure storage unavailable.');return crypto.createHash('sha256').update('tuffbros-delivery-v1\0'+process.env.BOOKING_SESSION_SECRET).digest();}
function seal(v){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,c.update(JSON.stringify(v)),c.final(),c.getAuthTag()]).toString('base64');}
async function settings(){const row=await storage().get('config',{type:'json'});if(!row)return null;const b=Buffer.from(row.sealed,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
export async function acknowledge(id){
 const receipts=bookingStore('os-event-receipts');
 const row=await receipts.getWithMetadata(id,{type:'json'});
 if(row&&!row.data.deliveredAt){const saved=await writeJSON(receipts,id,{...row.data,deliveredAt:new Date().toISOString()},{onlyIfMatch:row.etag});if(!saved.modified)throw Error('Receipt changed; retry acknowledgement.');}
 await queue().delete(id);
 await storage().delete('failure/'+id);
}
async function failure(event,status){
 const name='failure/'+event.id,row=await storage().getWithMetadata(name,{type:'json'}),old=row?.data||{},now=new Date().toISOString();
 const next={id:event.id,kind:event.kind,attempts:(old.attempts||0)+1,firstFailedAt:old.firstFailedAt||now,lastFailedAt:now,nextRetryAt:Date.now()+Math.min(3600000,60000*2**Math.min(old.attempts||0,6)),status};
 await writeJSON(storage(),name,next,row?{onlyIfMatch:row.etag}:{onlyIfNew:true});
 if(next.attempts>=3&&['quote','booking','chat'].includes(event.kind))console.error('WEBSITE_LEAD_DELIVERY_ALERT',next);
}
export async function deliverEvent(event,{fetcher=fetch}={}){
 const c=await settings();if(!c){await failure(event,'not_configured');return false;}
 const timestamp=String(Date.now()),body=JSON.stringify(event),path='/api/website/receive';
 const signature=crypto.createHmac('sha256',c.hmacKey).update(['POST',path,timestamp,body].join('\n')).digest('hex');
 try{
  const r=await fetcher(OS+path,{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+c.serviceToken,'X-Website-Timestamp':timestamp,'X-Website-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(10000)});
  const result=r.ok?await r.json():null;
  if(!r.ok||result?.id!==event.id){await failure(event,String(r.status));return false;}
  await acknowledge(event.id);return true;
 }catch{await failure(event,'unavailable');return false;}
}
export async function deliveryStatus(){
 const failures=[];for await(const page of storage().list({prefix:'failure/',paginate:true})){for(const b of page.blobs){const row=await storage().get(b.key,{type:'json'});if(row&&await queue().get(row.id,{type:'json'}))failures.push(row);}if(failures.length>=100)break;}
 let pendingCount=0;for await(const page of queue().list({paginate:true})){pendingCount+=page.blobs.length;if(pendingCount>100)break;}
 const health=await storage().get('health',{type:'json'});
 let emailAlertConfigured=false;try{const {readConfig}=await import('./receptionist.mjs');const c=await readConfig();emailAlertConfigured=!!(c.resendKey&&c.fromEmail);}catch{}
 return {configured:!!await settings(),emailAlertConfigured,pendingCount,pendingCountPartial:pendingCount>100,health,failures,persistentFailures:failures.filter(f=>f.attempts>=3&&['quote','booking','chat'].includes(f.kind)).length};
}
export async function retryDelivery(){
 let processed=0,delivered=0;const started=Date.now();
 for await(const page of queue().list({paginate:true})){for(const b of page.blobs){const event=await queue().get(b.key,{type:'json'});if(event){const failed=await storage().get('failure/'+event.id,{type:'json'});if(!failed||!failed.nextRetryAt||failed.nextRetryAt<=Date.now()){processed++;if(await deliverEvent(event))delivered++;}}if(processed>=20||Date.now()-started>15000)break;}if(processed>=20||Date.now()-started>15000)break;}
 await storage().setJSON('health',{lastRunAt:new Date().toISOString(),processed,delivered,pendingMayRemain:processed>=20||Date.now()-started>15000});
 // Owner-only operational alert; no customer payload or customer recipient.
 const status=await deliveryStatus();
 if(status.persistentFailures){
  const {readConfig}=await import('./receptionist.mjs'),c=await readConfig();
  if(c.resendKey&&c.fromEmail){const slot=new Date().toISOString().slice(0,13),id='website-delivery-alert-'+slot;
   const prior=await storage().get(id,{type:'json'});
   if(!prior){try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+c.resendKey,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:c.fromEmail,to:['jonathanrod98@gmail.com'],subject:'Tuff Bros: website inquiries need delivery review',text:status.persistentFailures+' website inquiries remain safely queued after repeated delivery failures. Open OS Settings → Website connection and review Netlify os-delivery logs. Do not re-enter these inquiries manually; their original IDs will be retried.'}),signal:AbortSignal.timeout(10000)});if(r.ok)await storage().setJSON(id,{at:new Date().toISOString()});}catch{console.error('Website owner alert could not be delivered.');}}
  }
 }
 return {processed,delivered};
}
export async function deliveryBridge(request,v){const path=new URL(request.url).pathname;if(!path.includes('/delivery/'))return null;
 if(request.method==='GET'&&path.endsWith('/status'))return json(await deliveryStatus());
 if(request.method==='POST'&&path.endsWith('/config')){if(typeof v?.serviceToken!=='string'||!v.serviceToken||!/^[-a-zA-Z0-9]{64,128}$/.test(v.hmacKey||''))return json({error:'Invalid delivery configuration.'},400);await storage().setJSON('config',{sealed:seal({serviceToken:v.serviceToken,hmacKey:v.hmacKey})});return json({configured:true});}
 if(request.method==='POST'&&path.endsWith('/restore')){if(!v?.event||v.event.id!==v.id||!/^[-a-f0-9]{36}$/.test(v.id))return json({error:'Invalid receipt.'},400);const hash=eventHash(v.event);await bookingStore('os-event-receipts').setJSON(v.id,{hash,event:v.event,deliveredAt:new Date().toISOString()});await acknowledge(v.id);return json({id:v.id,restored:true});}
 if(request.method==='POST'&&path.endsWith('/retry'))return json(await retryDelivery());
 return json({error:'Not found.'},404);
}

// Same existing encrypted service connection; token hashes only, no booking writes.
export async function readLiveAppointment(tokenHash,{fetcher=fetch}={}){
 try{
  const c=await settings();if(!c)return null;
  const path='/api/website/appointment-view',body=JSON.stringify({tokenHash}),timestamp=String(Date.now());
  const signature=crypto.createHmac('sha256',c.hmacKey).update(['POST',path,timestamp,body].join('\n')).digest('hex');
  const r=await fetcher(OS+path,{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+c.serviceToken,'X-Website-Timestamp':timestamp,'X-Website-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(r.status===410)return {revoked:true};if(!r.ok)return null;
  const value=await r.json();return value?.appointment&&typeof value.updatedAt==='string'&&typeof value.expiresAt==='string'?value:null;
 }catch{return null;}
}
