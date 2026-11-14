import {readConfig} from './lib/receptionist.mjs';
import {validSignature,parseEvents,CALLBACK} from './lib/facebook-core.mjs';
import {queueEvents,verifiedCallback} from './lib/facebook.mjs';
import {json} from './lib/booking-security.mjs';
export default async request=>{
 const c=await readConfig(),url=new URL(request.url);
 if(request.method==='GET'){
  const challenge=url.searchParams.get('hub.challenge')||'';
  if(!c.facebookVerifyToken||url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==c.facebookVerifyToken||!/^\d{1,100}$/.test(challenge))return json({error:'Verification failed.'},403);
  await verifiedCallback();return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
 }
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(Number(request.headers.get('content-length')||0)>200000)return json({error:'Too large.'},413);
 const raw=await request.text();if(Buffer.byteLength(raw)>200000)return json({error:'Too large.'},413);
 const signature=request.headers.get('x-hub-signature-256');
 if(!validSignature(raw,signature,c.facebookAppSecret))return json({error:'Invalid signature.'},403);
 let events;try{events=parseEvents(JSON.parse(raw));}catch{return json({error:'Invalid webhook.'},400);}
 if(!events.length)return json({ok:true});
 await queueEvents(events); // Acknowledge only after a durable write and worker invocation.
 const r=await fetch(CALLBACK+'-background',{method:'POST',body:raw,headers:{'Content-Type':'application/json','x-hub-signature-256':signature},redirect:'error',signal:AbortSignal.timeout(8000)});
 return r.ok?json({ok:true}):json({error:'Worker unavailable. Retry.'},503);
};
