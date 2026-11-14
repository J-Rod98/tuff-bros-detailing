import crypto from 'node:crypto';
import {readConfig,respond,voiceXml,greeting} from './lib/receptionist.mjs';
import {enqueue,clean} from './lib/os-bridge.mjs';
const xml=body=>new Response(body,{headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'}});
export function validTwilio(request,params,token){
 if(!token)return false;
 const origin=process.env.URL||new URL(request.url).origin,url=new URL(request.url);let data=origin+url.pathname+url.search;
 for(const key of [...new Set([...params.keys()])].sort())for(const v of [...new Set(params.getAll(key))].sort())data+=key+v;
 const wanted=crypto.createHmac('sha1',token).update(data).digest('base64'),actual=request.headers.get('x-twilio-signature')||'';
 return actual.length===wanted.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(wanted));
}
function uuid(text){const h=crypto.createHash('sha256').update(text).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
export default async request=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const raw=await request.text();if(raw.length>20000)return new Response('Too large',{status:413});
 const params=new URLSearchParams(raw);let c;try{c=await readConfig();}catch{return new Response('Unavailable',{status:503});}
 if(!validTwilio(request,params,c.twilioToken)||params.get('AccountSid')!==c.twilioSid||params.get('To')!==c.fromNumber)return new Response('Unauthorized',{status:403});
 if(!c.phoneEnabled)return xml(voiceXml('The virtual receptionist is currently unavailable. Please contact Tuff Bros through the website.',null,{end:true}));
 const call=params.get('CallSid')||'',from=params.get('From')||'';if(!/^CA[a-fA-F0-9]{32}$/.test(call)||!/^\+[1-9]\d{7,14}$/.test(from))return new Response('Invalid call',{status:400});
 const id=crypto.createHash('sha256').update('voice:'+call).digest('hex'),url=new URL(request.url),turn=Number(url.searchParams.get('turn')||0),message=clean(params.get('SpeechResult'),4000);
 if(!Number.isInteger(turn)||turn<0||turn>20)return xml(voiceXml('Thank you. Please contact the team through the website for further help.',null,{end:true}));
 const next=new URL(url.pathname,process.env.URL||url.origin);next.searchParams.set('turn',String(turn+1));
 if(!message)return xml(voiceXml(greeting,next.href));
 const eventId=uuid(call+':'+turn);
 try{
 await enqueue({id:eventId,kind:'chat',at:new Date().toISOString(),path:'/',source:'Phone receptionist',campaign:'',name:'Phone caller',phone:from,email:'',address:'',vehicle:'',service:'',notes:'Inbound forwarded call. No booking or SMS consent inferred.',conversationId:id,body:message,receptionist:{speaker:'customer',channel:'voice',needsHuman:false,summary:'',reason:''}});
 const result=await respond({id,eventId,message,name:'Phone caller',phone:from,channel:'voice'});
 return xml(voiceXml(result.reply||'The team will review your message.',next.href,{end:!!result.needsHuman||!!result.handoff}));
 }catch{return xml(voiceXml('Your call needs team review. Please leave a message through tuff bros detailing dot com.',null,{end:true}));}
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:120}};
