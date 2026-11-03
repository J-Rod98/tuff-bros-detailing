import {responseDetails} from '../../../quote/response-model.js';
import crypto from 'node:crypto';
import {bookingStore,json,detectImageType,takeRateLimit} from './booking-security.mjs';
const quotes=()=>bookingStore('customer-quotes'),receipts=()=>bookingStore('quote-receipts'),photos=()=>bookingStore('quote-photo-meta');
export const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
export async function quoteBridge(request,v={}){
 const url=new URL(request.url),path=url.pathname;
 if(path.endsWith('/quotes')&&request.method==='POST'){
  if(!uuid(v.id)||!hex(v.tokenHash)||!hex(v.snapshotHash)||!v.snapshot||!['lead','estimate'].includes(v.snapshot.recordType)||!Array.isArray(v.snapshot.options)||!v.snapshot.options.length||v.snapshot.options.length>30||v.snapshot.options.some(o=>!o.id||typeof o.description!=='string'||!Number.isFinite(o.price)||o.price<0||o.price>1000000)||digest(JSON.stringify(v.snapshot))!==v.snapshotHash||!Number.isFinite(Date.parse(v.expiresAt))||Date.parse(v.expiresAt)>Date.now()+31*86400000||Date.parse(v.expiresAt)<=Date.now())return json({error:'Invalid quote.'},400);
  const existing=await quotes().get(v.tokenHash,{type:'json'});if(existing){if(existing.id!==v.id||existing.snapshotHash!==v.snapshotHash||existing.revoked)return json({error:'Quote already published or revoked.'},409);return json({ok:true});}
  await quotes().setJSON(v.tokenHash,{...v,revoked:false,response:null,uploads:0},{onlyIfNew:true});return json({ok:true});
 }
 if(path.endsWith('/quotes/context')&&request.method==='POST'){if(!hex(v.tokenHash)||!hex(v.snapshotHash)||!v.contact||!v.appointments)return json({error:'Invalid quote context.'},400);const saved=await quotes().getWithMetadata(v.tokenHash,{type:'json'}),q=saved?.data;if(!q||q.revoked||q.response||q.snapshotHash!==v.snapshotHash)return json({ok:true,updated:false});const write=await quotes().setJSON(v.tokenHash,{...q,displayContact:v.contact,displayAppointments:v.appointments},{onlyIfMatch:saved.etag});return json({ok:true,updated:write.modified});}
 if(path.endsWith('/quotes/revoke')&&request.method==='POST'){if(!hex(v.tokenHash))return json({error:'Invalid link.'},400);for(let i=0;i<4;i++){const q=await quotes().getWithMetadata(v.tokenHash,{type:'json'});if(!q)return json({ok:true});const r=await quotes().setJSON(v.tokenHash,{...q.data,revoked:true},{onlyIfMatch:q.etag});if(r.modified)return json({ok:true});}return json({error:'Try revoking again.'},409);}
 if(path.endsWith('/quote-responses')&&request.method==='GET'){const responses=[];for await(const page of quotes().list({paginate:true})){for(const b of page.blobs){const q=await quotes().get(b.key,{type:'json'});if(q?.response&&!await receipts().get('response/'+q.response.id))responses.push(q.response);if(responses.length>=100)break;}if(responses.length>=100)break;}return json({responses});}
 if(path.endsWith('/quote-uploads')&&request.method==='GET'){const uploads=[];for await(const page of photos().list({paginate:true})){for(const b of page.blobs){if(!await receipts().get('file/'+b.key)){const f=await photos().get(b.key,{type:'json'});if(f)uploads.push(f);}if(uploads.length>=100)break;}if(uploads.length>=100)break;}return json({uploads});}
 if(path.endsWith('/quote-file')&&request.method==='GET'){const id=url.searchParams.get('id');if(!uuid(id))return json({error:'Invalid file.'},400);const b=await bookingStore('quote-photo-data').get(id,{type:'arrayBuffer'});if(!b)return json({error:'Not found.'},404);return json({base64:Buffer.from(b).toString('base64')});}
 if(path.endsWith('/quote-ack')&&request.method==='POST'){if(!Array.isArray(v.ids)||!Array.isArray(v.fileIds)||[...v.ids,...v.fileIds].some(id=>!uuid(id))||v.ids.length+v.fileIds.length>200)return json({error:'Invalid IDs.'},400);for(const id of v.ids)await receipts().set('response/'+id,'1');for(const id of v.fileIds)await receipts().set('file/'+id,'1');return json({ok:true});}
 return null;
}
export async function customerQuote(request){
 const origin=new URL(request.url).origin;if(request.method!=='POST')return json({error:'Method not allowed.'},405);if(request.headers.get('origin')!==origin)return json({error:'Open the customer quote page directly.'},403);
 if(!await takeRateLimit(request,{name:'customer-quote',limit:50,windowMs:60000}))return json({error:'Please wait a minute.'},429);
 if(Number(request.headers.get('content-length')||0)>5500000)return json({error:'Use a photo under 5 MB.'},413);
 const multipart=(request.headers.get('content-type')||'').includes('multipart/form-data');let v;try{if(multipart)v=Object.fromEntries(await request.formData());else{const text=await request.text();if(text.length>10000)return json({error:'Too large.'},413);v=JSON.parse(text);}}catch{return json({error:'Invalid request.'},400);}
 if(!v||!hex(v.token))return json({error:'This quote link is invalid.'},404);const key=digest(v.token),saved=await quotes().getWithMetadata(key,{type:'json'}),q=saved?.data;
 if(!q||q.revoked||Date.parse(q.expiresAt)<Date.now())return json({error:'This quote link has expired or was revoked. Please contact Tuff Bros.'},410);
 if(v.action==='view')return json({quote:q.snapshot,contact:q.displayContact||q.snapshot.contact,appointments:q.displayAppointments||q.snapshot.appointments,expiresAt:q.expiresAt,response:q.response?{decision:q.response.decision,name:q.response.name,at:q.response.at}:null,uploads:q.uploads});
 if(v.action==='respond'){
  if(!uuid(v.id)||!['Accepted','Changes requested','Declined'].includes(v.decision)||typeof v.message!=='string'||v.message.length>3000||!q.snapshot.options.some(o=>o.id===v.optionId)||v.confirm!==true)return json({error:'Select an option, enter your name and confirm your response.'},400);
  if(q.response){if(q.response.id===v.id)return json({ok:true,response:q.response});return json({error:'A response was already recorded. Please contact Tuff Bros to change it.'},409);}
  let details;try{details=responseDetails(v,q.snapshot,q.snapshotHash,new Date().toISOString(),q.displayAppointments);}catch(e){return json({error:e.message},400);}
  const response={...details,id:v.id,shareId:q.id,snapshotHash:q.snapshotHash,decision:v.decision,optionId:v.optionId,name:details.name,message:v.message.trim(),at:details.acknowledgment.at};const write=await quotes().setJSON(key,{...q,response},{onlyIfMatch:saved.etag});if(!write.modified)return json({error:'This quote changed. Refresh before responding.'},409);return json({ok:true,response});
 }
 if(v.action==='upload'&&multipart){
  const f=v.file;if(!(f instanceof File)||!f.size||f.size>5000000)return json({error:'Choose a JPEG, PNG or WebP under 5 MB.'},400);const bytes=Buffer.from(await f.arrayBuffer()),type=detectImageType(bytes);if(!type||!['image/jpeg','image/png','image/webp'].includes(type.mime))return json({error:'Use JPEG, PNG or WebP.'},400);if(q.uploads>=5)return json({error:'This quote already has five photos. Contact Tuff Bros to share more.'},422);
  const write=await quotes().setJSON(key,{...q,uploads:q.uploads+1},{onlyIfMatch:saved.etag});if(!write.modified)return json({error:'Please retry this photo.'},409);
  const id=crypto.randomUUID(),name=f.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180);await bookingStore('quote-photo-data').set(id,bytes);await photos().setJSON(id,{id,shareId:q.id,name,mime:type.mime,size:bytes.length,at:new Date().toISOString()});return json({ok:true,id,name});
 }
 return json({error:'Invalid quote action.'},400);
}
