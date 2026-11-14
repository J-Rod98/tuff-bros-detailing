import {bookingStore,json} from './booking-security.mjs';
import {readConfig,saveConfig,takeBudget} from './receptionist.mjs';
import {receptionistTurn} from './receptionist-core.mjs';
import {PAGE_ID,APP_ID,CALLBACK,hash,eventId,normalizeFacebook,facebookBlockers,eligibleEvent} from './facebook-core.mjs';
const store=()=>bookingStore('facebook-receptionist');
const now=()=>new Date().toISOString();
const threadKey=e=>'thread/'+hash(e.channel+':'+(e.psid||e.leadId));
async function health(){return await store().get('health',{type:'json'})||{};}
async function patchHealth(patch){for(let i=0;i<4;i++){const row=await store().getWithMetadata('health',{type:'json'});if((await store().setJSON('health',{...row?.data,...patch},row?{onlyIfMatch:row.etag}:{onlyIfNew:true})).modified)return;}throw Error('Connection status changed. Retry.');}
export async function verifiedCallback(){await patchHealth({verifiedAt:now()});}
async function graph(c,path,params={},fetcher=fetch){
 const u=new URL('https://graph.facebook.com/v27.0/'+path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
 const r=await fetcher(u,{headers:{Authorization:'Bearer '+c.facebookPageToken},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Meta connection needs review.');return r.json();
}
export async function facebookStatus(){const c=await readConfig(),h=await health();return {settings:normalizeFacebook(c.facebook),pageId:PAGE_ID,appId:APP_ID,callback:CALLBACK,secretConfigured:!!c.facebookAppSecret,pageConnected:!!c.facebookPageToken,emailConfigured:!!(c.resendKey&&c.fromEmail),fromEmail:c.fromEmail||'',health:h,blockers:facebookBlockers(c,h)};}
export async function facebookBridge(request,v){
 const path=new URL(request.url).pathname;if(!path.includes('/receptionist/facebook'))return null;
 try{
  if(request.method==='GET'&&path.endsWith('/status'))return json(await facebookStatus());
  if(request.method==='GET'&&path.endsWith('/activity')){const threads=[];for await(const page of store().list({prefix:'thread/',paginate:true})){for(const b of page.blobs){const t=await store().get(b.key,{type:'json'});if(t)threads.push(t);}if(threads.length>=200)break;}return json({threads:threads.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50),partial:threads.length>=200});}
  if(request.method==='GET'&&path.endsWith('/setup')){const c=await readConfig();return json({callback:CALLBACK,verifyToken:c.facebookVerifyToken||''});}
  if(request.method==='POST'&&['/revoke-email','/revoke-page','/disconnect'].some(x=>path.endsWith(x))){const c=await readConfig();c.facebook={...normalizeFacebook(c.facebook),messengerSince:c.facebook?.messengerSince,emailSince:c.facebook?.emailSince};if(path.endsWith('/revoke-email')){delete c.resendKey;delete c.fromEmail;c.facebook.leadEmailEnabled=false;}else{delete c.facebookPageToken;c.facebook.messengerEnabled=false;c.facebook.leadEmailEnabled=false;}if(path.endsWith('/disconnect')){delete c.facebookAppSecret;delete c.facebookVerifyToken;await store().setJSON('health',{});}await saveConfig(c);return json(await facebookStatus());}
  if(request.method==='POST'&&path.endsWith('/config')){
   const old=await readConfig(),f=normalizeFacebook(v.settings),h=await health();
   const next={...old,facebook:{...f,messengerSince:old.facebook?.messengerEnabled?old.facebook.messengerSince:now(),emailSince:old.facebook?.leadEmailEnabled?old.facebook.emailSince:now()}};
   for(const k of ['facebookPageToken','facebookAppSecret','facebookVerifyToken','resendKey','fromEmail'])if(typeof v[k]==='string')next[k]=v[k];
   if(v.disconnect===true){delete next.facebookPageToken;delete next.facebookAppSecret;delete next.facebookVerifyToken;next.facebook.messengerEnabled=false;next.facebook.leadEmailEnabled=false;}
   if(next.facebookAppSecret!==old.facebookAppSecret||next.facebookPageToken!==old.facebookPageToken){await store().setJSON('health',{});Object.keys(h).forEach(k=>delete h[k]);}
   const blockers=facebookBlockers(next,h,!old.facebook?.messengerEnabled&&!old.facebook?.leadEmailEnabled);
   if(next.facebook.messengerEnabled&&blockers.messenger.length||next.facebook.leadEmailEnabled&&blockers.email.length)return json({error:'Finish the Facebook connection steps before enabling replies.',blockers},422);
   await saveConfig(next);return json(await facebookStatus());
  }
  if(request.method==='POST'&&path.endsWith('/check')){
   const c=await readConfig();if(!c.facebookPageToken)return json({error:'Connect the Tuff Bros Page first.'},422);
   const page=await graph(c,'me',{fields:'id,name'});if(page.id!==PAGE_ID)return json({error:'Wrong Facebook Page.'},422);
   const apps=await graph(c,PAGE_ID+'/subscribed_apps',{fields:'id,subscribed_fields'}),app=apps.data?.find(a=>a.id===APP_ID);
   const subscriptions=Array.isArray(app?.subscribed_fields)?app.subscribed_fields.filter(x=>['messages','message_echoes','leadgen'].includes(x)):[];
   let forms=[],formsError='';try{const r=await graph(c,PAGE_ID+'/leadgen_forms',{fields:'id,name,status',limit:'100'});forms=(r.data||[]).map(f=>({id:f.id,name:String(f.name||'').slice(0,150),status:f.status}));if(r.paging?.next)formsError='Only the first 100 forms are shown.';}catch{formsError='Lead forms could not be read. Check leads access in Meta.';}
   await patchHealth({checkedAt:now(),subscriptions,forms,formsError});return json(await facebookStatus());
  }
  if(request.method==='POST'&&path.endsWith('/pause')){
   if(!/^[a-f0-9]{64}$/.test(v.id)||typeof v.paused!=='boolean')return json({error:'Invalid conversation.'},400);
   const key='thread/'+v.id;for(let i=0;i<4;i++){const row=await store().getWithMetadata(key,{type:'json'});if(!row)return json({error:'Conversation not found.'},404);if((await store().setJSON(key,{...row.data,paused:v.paused,needsHuman:v.paused,updatedAt:now()}, {onlyIfMatch:row.etag})).modified)return json({ok:true});}return json({error:'Conversation changed. Retry.'},409);
  }
  return json({error:'Facebook action not found.'},404);
 }catch{return json({error:'Facebook connection is unavailable. Check the Meta permissions and retry.'},503);}
}
export async function queueEvents(events){
 for(const e of events){
  if(e.echo){if(e.appId!==APP_ID){const receipt='echo/'+hash(e.key);if((await store().setJSON(receipt,{at:now()},{onlyIfNew:true})).modified){try{await pauseForHuman(e);}catch(error){await store().delete(receipt);throw error;}}}continue;}
  const key='event/'+hash(e.key);await store().setJSON(key,{event:e,state:'queued',receivedAt:now()},{onlyIfNew:true});
 }
 await patchHealth({lastWebhookAt:now()});
}
async function pauseForHuman(e){
 const key=threadKey(e);for(let i=0;i<4;i++){const row=await store().getWithMetadata(key,{type:'json'}),t=row?.data||{id:key.slice(7),channel:e.channel,messages:[]};
  const messages=t.messages||[];if(!messages.some(m=>m.id===e.key))messages.push({id:e.key,role:'team',body:e.body||'[Attachment]',at:new Date(e.at).toISOString()});
  if((await store().setJSON(key,{...t,messages:messages.slice(-80),paused:true,needsHuman:true,updatedAt:now()},row?{onlyIfMatch:row.etag}:{onlyIfNew:true})).modified)return;
 }throw Error('Human takeover could not be recorded.');
}
async function leadDetails(c,e,fetcher){
 const lead=await graph(c,e.leadId,{fields:'id,created_time,form_id,field_data'},fetcher);
 if(String(lead.id)!==e.leadId||String(lead.form_id)!==e.formId||!Number.isFinite(Date.parse(lead.created_time))||Math.abs(Date.parse(lead.created_time)-e.at)>300000||Date.parse(lead.created_time)<Date.parse(c.facebook.emailSince))throw Error('Lead identity or date needs review.');
 const fields=Object.fromEntries((lead.field_data||[]).map(f=>[f.name,(f.values||[]).join(' ').slice(0,500)]));
 const email=String(fields.email||'').trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>200)throw Error('The lead has no usable email.');
 const detail=Object.entries(fields).map(([k,v])=>k+': '+v).join('\n').slice(0,3500);
 if(/\b(?:do not|don.t|stop)\s+(?:contact|email|message)|unsubscribe/i.test(detail))throw Error('Customer contact preferences need review.');
 return {email,name:String(fields.full_name||fields.first_name||'Facebook inquiry').slice(0,100),body:'New Facebook lead-form request. Acknowledge the inquiry and ask for the next missing detailing detail. Do not repeat the supplied email or phone.\n'+detail};
}
export async function processEvent(key,{fetcher=fetch}={}){
 let row=await store().getWithMetadata(key,{type:'json'});if(!row)return;
 if(row.data.state==='sent'&&row.data.result){const r=row.data.result;for(let i=0;i<4;i++){const prior=await store().getWithMetadata('thread/'+r.id,{type:'json'});if(prior?.data.messages?.some(m=>m.providerId===row.data.providerId))return;const next={...r,...prior?.data,messages:[...new Map([...(prior?.data.messages||[]),...r.messages].map(m=>[m.id,m])).values()].slice(-80),updatedAt:now()};if((await store().setJSON('thread/'+r.id,next,prior?{onlyIfMatch:prior.etag}:{onlyIfNew:true})).modified)return;}throw Error('Receipt is waiting to be recorded.');}
 if(['sent','review','unknown'].includes(row.data.state))return;
 if(row.data.state==='sending'){await store().setJSON(key,{...row.data,state:'unknown',reason:'Delivery may have succeeded. Check the provider before any manual follow-up.'},{onlyIfMatch:row.etag});return;}
 if(row.data.lockUntil>Date.now())throw Error('Event is being processed.');
 const claimed={...row.data,state:'processing',lockUntil:Date.now()+90000};if(!(await store().setJSON(key,claimed,{onlyIfMatch:row.etag})).modified)return;
 const e=claimed.event,c=await readConfig(),tkey=threadKey(e);let trow=await store().getWithMetadata(tkey,{type:'json'}),t=trow?.data||{id:tkey.slice(7),channel:e.channel,psid:e.psid||'',leadId:e.leadId||'',formId:e.formId||'',name:e.channel==='messenger'?'Messenger inquiry':'Facebook lead',messages:[],updatedAt:now()};
 const finish=async(state,reason,extra={})=>{const r=await store().getWithMetadata(key,{type:'json'});await store().setJSON(key,{...r.data,state,reason,lockUntil:0,...extra},{onlyIfMatch:r.etag});};
 let locked=false;
 try{
  const blocked=eligibleEvent(e,c),readiness=facebookBlockers(c,await health(),false);
  let reason=blocked||(e.channel==='messenger'?readiness.messenger:readiness.email).join(' ');
  if(t.paused||t.needsHuman)reason='Conversation is with the team.';
  if(e.attachment)reason='Attachment needs a team review.';
  if(!e.body&&e.channel==='messenger')reason='Message content needs review.';
  if(e.channel==='messenger'&&/^\s*(?:stop|unsubscribe|don.t (?:message|contact)|do not (?:message|contact))\b/i.test(e.body))reason='Customer asked to stop automatic contact.';
  if(t.lockUntil>Date.now()){await finish('queued','Waiting for the preceding message.');throw Object.assign(Error('Conversation is busy.'),{retry:true});}
  const lock={...t,lockUntil:Date.now()+90000,updatedAt:now()};if(!(await store().setJSON(tkey,lock,trow?{onlyIfMatch:trow.etag}:{onlyIfNew:true})).modified)throw Object.assign(Error('Conversation changed.'),{retry:true});locked=true;t=lock;
  let contact={};if(!reason&&e.channel==='facebook-email')contact=await leadDetails(c,e,fetcher);
  const body=e.body||contact.body||'Facebook form '+e.formId+' · '+e.leadId,at=new Date(e.at).toISOString();
  t={...t,name:contact.name||t.name,email:contact.email||t.email,psid:e.psid||'',leadId:e.leadId||'',formId:e.formId||'',messages:t.messages.some(m=>m.id===e.key)?t.messages:[...t.messages,{id:e.key,role:'customer',body,at}].slice(-80),updatedAt:now()};
  if(reason){t={...t,needsHuman:true,delivery:'Review',reason};await finish('review',reason);return;}
  if(t.messages.filter(m=>m.role==='receptionist').length>=20||!await takeBudget(c.dailyLimit||100))throw Error('Reply limit reached. Team review required.');
  const turn=await receptionistTurn({apiKey:c.apiKey,model:c.model||'gpt-4o-mini',catalog:c.catalog,serviceArea:c.serviceArea,replyPreferences:c.replyPreferences,channel:e.channel,history:t.messages.slice(0,-1),message:body,fetcher});
  const first=!t.messages.some(m=>m.role==='receptionist'),reply=(first?'I’m the Tuff Bros virtual receptionist. ':'')+turn.reply;
  t={...t,summary:turn.summary,needsHuman:turn.needsHuman,reason:turn.reason,draft:reply};
  // Compare against the latest owner/echo takeover and global switch immediately before dispatch.
  const latest=await store().getWithMetadata(tkey,{type:'json'}),current=await readConfig();
  if(latest?.data.paused||latest?.data.needsHuman||latest?.data.lockUntil!==lock.lockUntil||eligibleEvent(e,current))throw Error('Automatic reply was stopped. Review the conversation.');
  if(e.channel==='facebook-email'){
   const guard='email/'+hash(contact.email.toLowerCase()+':'+new Date().toISOString().slice(0,10));
   if(!(await store().setJSON(guard,{event:e.key,at:now()},{onlyIfNew:true})).modified)throw Error('An email was already attempted for this address today.');
  }
  // Persist BEFORE the provider call. Ambiguous timeouts/crashes never retry a send automatically.
  await finish('sending','Waiting for provider receipt.');
  let response;
  try{response=e.channel==='messenger'?await fetcher('https://graph.facebook.com/v27.0/'+PAGE_ID+'/messages',{method:'POST',headers:{Authorization:'Bearer '+c.facebookPageToken,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify({recipient:{id:e.psid},messaging_type:'RESPONSE',message:{text:reply}})}):await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+c.resendKey,'Content-Type':'application/json','Idempotency-Key':'facebook-'+hash(e.key)},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify({from:c.fromEmail,to:[contact.email],reply_to:c.facebook.replyTo,subject:'Your Tuff Bros detailing request',text:reply+'\n\nReply to this email and Jonathan will continue with you. Final scope, prices and appointments are confirmed by the team.'})});}catch{t.delivery='Unknown';await finish('unknown','Provider receipt unavailable. Check the provider before resending.');return;}
  let receipt;try{receipt=await response.json();}catch{}
  const providerId=e.channel==='messenger'?receipt?.message_id:receipt?.id;
  if(!response.ok||!providerId){t.delivery=response.status>=500?'Unknown':'Rejected';await finish(response.status>=500?'unknown':'review','Provider did not confirm delivery. Check the provider before follow-up.');return;}
  t={...t,delivery:'Accepted by provider',draft:'',messages:[...t.messages,{id:eventId(e.key+':reply'),role:'receptionist',body:reply,at:now(),providerId}].slice(-80)};
  await finish('sent','Accepted by provider.',{providerId,result:{id:t.id,channel:t.channel,name:t.name,email:t.email||'',summary:t.summary,messages:t.messages.slice(-2),delivery:t.delivery}});
 }catch(error){if(error.retry){await finish('queued','Waiting to retry processing.');throw error;}t={...t,needsHuman:true,delivery:'Review',reason:String(error.message||'Needs review').slice(0,300)};await finish('review',t.reason);}
 finally{if(locked){for(let i=0;i<4;i++){const fresh=await store().getWithMetadata(tkey,{type:'json'});if(fresh?.data.lockUntil!==t.lockUntil)break;const saved=await store().setJSON(tkey,{...t,messages:[...new Map([...t.messages,...(fresh.data.messages||[])].map(m=>[m.id,m])).values()].slice(-80),paused:!!fresh.data.paused,needsHuman:!!(fresh.data.paused||fresh.data.needsHuman||t.needsHuman),lockUntil:0,updatedAt:now()},{onlyIfMatch:fresh.etag});if(saved.modified)break;if(i===3)throw Error('Conversation is waiting to be recorded.');}}}
}
