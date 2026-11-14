import {appointmentBridge} from './lib/appointment-portal.mjs';
import {facebookBridge} from './lib/facebook.mjs';
import {receptionistBridge,pauseConversation} from './lib/receptionist.mjs';
import {quoteBridge} from './lib/quote-portal.mjs';
import {json,bookingStore} from './lib/booking-security.mjs';
import {authorized,store,clean} from './lib/os-bridge.mjs';
export default async request=>{if(!await authorized(request))return json({error:'Unauthorized.'},401);const path=new URL(request.url).pathname;
 if(request.method==='GET'){const facebook=await facebookBridge(request);if(facebook)return facebook;const receptionist=await receptionistBridge(request);if(receptionist)return receptionist;const response=await quoteBridge(request);if(response)return response;const page=await store().list({paginate:true});const events=[];for await(const entry of page){for(const blob of entry.blobs){const event=await store().get(blob.key,{type:'json'});if(event)events.push(event);if(events.length===100)break;}if(events.length===100)break;}return json({events});}
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 const raw=await request.text();if(raw.length>((/\/(?:quotes(?:\/context)?|appointments|receptionist\/config)$/.test(path))?250000:12000))return json({error:'Too large.'},413);let v;try{v=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
 const appointmentResponse=await appointmentBridge(request,v);if(appointmentResponse)return appointmentResponse;
 const facebook=await facebookBridge(request,v);if(facebook)return facebook;
 const receptionist=await receptionistBridge(request,v);if(receptionist)return receptionist;
 const quoteResponse=await quoteBridge(request,v);if(quoteResponse)return quoteResponse;
 if(path.endsWith('/ack')){if(!Array.isArray(v.ids)||v.ids.length>100||v.ids.some(id=>!/^[-a-f0-9]{36}$/.test(id)))return json({error:'Invalid IDs.'},400);for(const id of v.ids)await store().delete(id);return json({ok:true});}
 if(path.endsWith('/reply')){if(!/^[a-f0-9]{64}$/.test(v.conversationId)||!/^[-a-f0-9]{36}$/.test(v.id)||!clean(v.body,4000)||String(v.body).length>4000)return json({error:'Invalid reply.'},400);const conversation=await bookingStore('os-conversations').get(v.conversationId,{type:'json'});if(!conversation)return json({error:'Conversation not found.'},404);await pauseConversation(v.conversationId);await bookingStore('os-replies').setJSON(v.conversationId+'/'+v.id,{id:v.id,body:clean(v.body,4000),at:new Date().toISOString()},{onlyIfNew:true});return json({ok:true});}
 return json({error:'Not found.'},404);
};
