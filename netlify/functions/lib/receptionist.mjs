import {normalizeReplyPreferences,configuredGreeting} from './receptionist-preferences.mjs';
import crypto from 'node:crypto';
import {bookingStore,json} from './booking-security.mjs';
import {enqueue,clean} from './os-bridge.mjs';
import {greeting,receptionistTurn} from './receptionist-core.mjs';
const store=()=>bookingStore('receptionist');
const defaults={websiteEnabled:false,phoneEnabled:false,serviceArea:'',catalog:[],dailyLimit:100,replyPreferences:normalizeReplyPreferences()};
function key(){if((process.env.BOOKING_SESSION_SECRET||'').length<32)throw Error('Secure receptionist storage is unavailable.');return crypto.createHash('sha256').update('tuffbros-receptionist-v1\0'+process.env.BOOKING_SESSION_SECRET).digest();}
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');}
function unseal(value){const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
export async function readConfig(){const row=await store().get('config',{type:'json'});return row?.sealed?{...defaults,...unseal(row.sealed)}:defaults;}
export async function saveConfig(c){await store().setJSON('config',{sealed:seal(c)});}
const status=c=>({websiteEnabled:!!c.websiteEnabled,phoneEnabled:!!c.phoneEnabled,aiConfigured:!!c.apiKey,phoneConfigured:!!(c.twilioToken&&c.twilioSid&&c.fromNumber),fromNumber:c.fromNumber||'',serviceArea:c.serviceArea||'',catalogCount:c.catalog.length,updatedAt:c.updatedAt||null,dailyLimit:c.dailyLimit||100,replyPreferences:normalizeReplyPreferences(c.replyPreferences)});
export async function receptionistBridge(request,v){
 const path=new URL(request.url).pathname;
 if(!path.includes('/receptionist'))return null;
 try{
 if(request.method==='GET'&&path.endsWith('/receptionist/status'))return json(status(await readConfig()));
 if(request.method==='GET'&&path.endsWith('/receptionist/threads')){const threads=[];for await(const page of store().list({prefix:'thread/',paginate:true})){for(const blob of page.blobs){const t=await store().get(blob.key,{type:'json'});if(t)threads.push({id:t.id,channel:t.channel,name:t.intake?.name||t.name||'Customer',phone:t.phone,summary:t.summary||'',needsHuman:!!t.needsHuman,paused:!!t.paused,updatedAt:t.updatedAt,messages:t.messages||[]});}if(threads.length>=200)break;}return json({threads:threads.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50),partial:threads.length>=200});}
 if(request.method==='POST'&&path.endsWith('/receptionist/config')){if(!v||typeof v.websiteEnabled!=='boolean'||typeof v.phoneEnabled!=='boolean'||!Array.isArray(v.catalog)||v.catalog.length>120)return json({error:'Invalid receptionist settings.'},400);const old=await readConfig();const c={...defaults,...old,websiteEnabled:v.websiteEnabled,phoneEnabled:v.phoneEnabled,serviceArea:clean(v.serviceArea,1000),catalog:v.catalog,replyPreferences:normalizeReplyPreferences(v.replyPreferences??old.replyPreferences),updatedAt:new Date().toISOString()};for(const k of ['apiKey','twilioToken','twilioSid','fromNumber'])if(typeof v[k]==='string'&&v[k])c[k]=v[k];if(c.websiteEnabled&&!c.apiKey)return json({error:'Connect the receptionist key first.'},422);if(c.phoneEnabled&&!(c.apiKey&&c.twilioToken&&c.twilioSid&&/^\+[1-9]\d{7,14}$/.test(c.fromNumber||'')))return json({error:'Connect a verified phone provider and number first.'},422);await store().setJSON('config',{sealed:seal(c)});return json(status(c));}
 if(request.method==='POST'&&path.endsWith('/receptionist/pause')){if(!/^[a-f0-9]{64}$/.test(v.id)||typeof v.paused!=='boolean')return json({error:'Invalid conversation.'},400);const row=await store().getWithMetadata('thread/'+v.id,{type:'json'});if(!row)return json({error:'Conversation not found.'},404);if(row.data.lockUntil>Date.now())return json({error:'A reply is in progress. Retry shortly.'},409);const result=await store().setJSON('thread/'+v.id,{...row.data,paused:v.paused,needsHuman:v.paused,updatedAt:new Date().toISOString()},{onlyIfMatch:row.etag});return result.modified?json({ok:true}):json({error:'Conversation changed. Refresh and try again.'},409);}
 return json({error:'Receptionist action not found.'},404);
 }catch{return json({error:'Receptionist connection is unavailable.'},503);}
}
export async function pauseConversation(id){const row=await store().getWithMetadata('thread/'+id,{type:'json'});if(!row)return;if(row.data.lockUntil>Date.now())throw Error('A receptionist reply is in progress. Please try again shortly.');const r=await store().setJSON('thread/'+id,{...row.data,paused:true,needsHuman:true},{onlyIfMatch:row.etag});if(!r.modified)throw Error('Conversation changed. Please retry.');}
export async function takeBudget(limit){const id='budget/'+new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago'}).format(new Date());for(let i=0;i<4;i++){const row=await store().getWithMetadata(id,{type:'json'}),count=row?.data?.count||0;if(count>=limit)return false;const r=await store().setJSON(id,{count:count+1},row?{onlyIfMatch:row.etag}:{onlyIfNew:true});if(r.modified)return true;}return false;}
const stableId=text=>{const h=crypto.createHash('sha256').update(text).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
export async function respond({id,eventId,message,name='',phone='',channel='website'}){
 const c=await readConfig();if(!(channel==='website'?c.websiteEnabled:c.phoneEnabled))return {enabled:false};
 const key='thread/'+id;let row=await store().getWithMetadata(key,{type:'json'});let thread=row?.data;
 if(thread&&Date.now()-Date.parse(thread.updatedAt)>30*86400000)thread=null;
 if(!thread)thread={id,channel,name,phone,messages:[],receipts:[],intake:{},updatedAt:new Date().toISOString()};
 const prior=thread.receipts.find(r=>r.id===eventId);
 if(prior){if(thread.lockUntil>Date.now())throw Error('A reply is still being saved.');if(prior.hash!==crypto.createHash('sha256').update(message).digest('hex'))throw Error('This message ID was already used.');await publish(prior.result);return prior.result;}
 if(thread.lockUntil>Date.now())throw Error('A reply is already in progress.');
 if(thread.paused||thread.needsHuman)return {enabled:true,handoff:true,reply:'Jonathan will review this conversation personally. You can leave more details here for the team.',summary:thread.summary||'',intake:thread.intake};
 const locked={...thread,lockUntil:Date.now()+30000};const claim=await store().setJSON(key,locked,row?{onlyIfMatch:row.etag}:{onlyIfNew:true});if(!claim.modified)throw Error('Another reply is in progress.');
 let turn;try{
 if(thread.messages.length>=40||!await takeBudget(c.dailyLimit))throw Error('The receptionist is waiting for team review.');
 turn=await receptionistTurn({apiKey:c.apiKey,model:c.model||'gpt-4o-mini',catalog:c.catalog,serviceArea:c.serviceArea,replyPreferences:c.replyPreferences,history:thread.messages,message,channel});
 }catch{turn={reply:'I’ve saved your message for the Tuff Bros team to review. Please leave your vehicle details and preferred callback time.',summary:clean(message,1200),needsHuman:true,reason:'AI reply unavailable or conversation limit reached.',intake:{}};}
 const at=new Date().toISOString(),replyId=stableId(eventId+':receptionist');
 const result={enabled:true,id:replyId,conversationId:id,phone:phone||thread.phone,reply:turn.reply,summary:turn.summary,needsHuman:turn.needsHuman,reason:turn.reason,intake:{...thread.intake,...Object.fromEntries(Object.entries(turn.intake).filter(([,v])=>v))},at,channel};
 const fresh=await store().getWithMetadata(key,{type:'json'});if(!fresh||fresh.data.lockUntil!==locked.lockUntil)throw Error('Conversation ownership changed.');
 thread={...thread,name:name||thread.name,phone:phone||thread.phone,intake:result.intake,summary:turn.summary,needsHuman:turn.needsHuman,updatedAt:at,lockUntil:locked.lockUntil,messages:[...thread.messages,{role:'customer',body:message.slice(0,4000),at},{role:'receptionist',body:turn.reply,at}].slice(-80),receipts:[...thread.receipts,{id:eventId,hash:crypto.createHash('sha256').update(message).digest('hex'),result}].slice(-40)};
 const saved=await store().setJSON(key,thread,{onlyIfMatch:fresh.etag});if(!saved.modified)throw Error('Conversation changed before saving.');try{await publish(result);}finally{const completed=await store().getWithMetadata(key,{type:'json'});if(completed?.data.lockUntil===locked.lockUntil)await store().setJSON(key,{...completed.data,lockUntil:0},{onlyIfMatch:completed.etag});}return result;
}
async function publish(r){
 if(r.channel==='website')await bookingStore('os-replies').setJSON(r.conversationId+'/'+r.id,{id:r.id,body:r.reply,at:r.at,agent:true},{onlyIfNew:true});
 // Same signed queue as existing website inquiries. Never creates a booking or accepted quote.
 const phone=clean(r.phone||r.intake.phone,30),email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.intake.email||'')?clean(r.intake.email,200):'';
 await enqueue({id:r.id,kind:'chat',at:r.at,path:'/',source:r.channel==='website'?'Website receptionist':'Phone receptionist',campaign:'',name:clean(r.intake.name,100)||'Receptionist inquiry',phone,email,address:clean(r.intake.address,300),vehicle:clean(r.intake.vehicle,150),service:clean(r.intake.service,200),conversationId:r.conversationId,body:r.reply,receptionist:{speaker:'receptionist',channel:r.channel,needsHuman:!!r.needsHuman,summary:clean(r.summary,1200),reason:clean(r.reason,500)},notes:[r.summary,r.needsHuman?'Jonathan review: '+r.reason:'Next: confirm missing details, scope and preferred appointment.'].join('\n').slice(0,2500)});
}
export function voiceXml(reply,action,{end=false}={}){const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));return '<?xml version="1.0" encoding="UTF-8"?><Response>'+(end?'<Say>'+esc(reply)+'</Say><Hangup/>':'<Gather input="speech" method="POST" action="'+esc(action)+'" speechTimeout="auto" timeout="6"><Say>'+esc(reply)+'</Say></Gather><Say>Thank you for calling Tuff Bros. Goodbye.</Say>')+'</Response>';}
export function openingMessage(c){return configuredGreeting(c.replyPreferences,greeting);}
export {greeting};
