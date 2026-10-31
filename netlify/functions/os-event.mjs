import crypto from 'node:crypto';
import {json,bookingStore,sameOrigin,takeRateLimit} from './lib/booking-security.mjs';
import {enabled,enqueue,clean,attribution,session} from './lib/os-bridge.mjs';
export default async request=>{
 if(!enabled())return json({enabled:false},503);
 const chat=session(request),headers=chat.cookie?{'Set-Cookie':chat.cookie}:{};
 if(request.method==='GET'){if(new URL(request.url).searchParams.get('chat')!=='1')return json({enabled:true});const replies=[];const pages=await bookingStore('os-replies').list({prefix:chat.id+'/',paginate:true});for await(const page of pages){for(const blob of page.blobs){const reply=await bookingStore('os-replies').get(blob.key,{type:'json'});if(reply)replies.push(reply);if(replies.length>=200)break;}if(replies.length>=200)break;}return json({enabled:true,replies:replies.sort((a,b)=>a.at.localeCompare(b.at))},200,headers);}
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(!sameOrigin(request))return json({error:'Use the website form.'},403);
 if(!await takeRateLimit(request,{name:'os-event',limit:40,windowMs:60000}))return json({error:'Please wait a minute and try again.'},429);
 if(Number(request.headers.get('content-length')||0)>16000)return json({error:'Too large.'},413);
 let v;try{if((request.headers.get('content-type')||'').includes('multipart/form-data'))v=Object.fromEntries(await request.formData());else {const text=await request.text();if(text.length>16000)return json({error:'Too large.'},413);v=JSON.parse(text);}}catch{return json({error:'Invalid request.'},400);}
 if(!v||typeof v!=='object'||Array.isArray(v))return json({error:'Invalid request.'},400);
 if(v._gotcha)return json({ok:true});
 const kind=v.kind||'quote';if(!['quote','chat','page_view','phone_click','text_click'].includes(kind))return json({error:'Invalid event.'},400);
 const event={id:clean(v.id,36)||crypto.randomUUID(),kind,at:new Date().toISOString(),...attribution(v)};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(event.id))return json({error:'Invalid request ID.'},400);
 if(['quote','chat'].includes(kind)){Object.assign(event,{name:clean(v.name,100),phone:clean(v.phone,30),email:clean(v.email,200),address:clean(v.city||v.address,300),vehicle:clean(v.vehicle,150),service:clean(v.service,200),notes:[clean(v.message,1800),...['condition','petHair','odor','ceramic','ceramic_package'].map(k=>v[k]?k+': '+clean(v[k],100):'')].filter(Boolean).join('\n')});if(!event.name||!/^[-+0-9().\s]{7,30}$/.test(event.phone)||event.phone.replace(/\D/g,'').length<7||(event.email&&!/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i.test(event.email)))return json({error:'Enter your name and valid phone/email details.'},400);}
 if(kind==='chat'){event.body=clean(v.body,4000);event.conversationId=chat.id;if(!event.body)return json({error:'Enter a message.'},400);await bookingStore('os-conversations').setJSON(chat.id,{name:event.name,phone:event.phone,createdAt:event.at},{onlyIfNew:true});}
 await enqueue(event);return json({ok:true,id:event.id},200,kind==='chat'?headers:{});
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:60}};
