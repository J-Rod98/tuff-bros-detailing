import crypto from 'node:crypto';
import {bookingStore} from './booking-security.mjs';
import {PUBLIC_KEY} from './os-public-key.mjs';
export const enabled=()=>!!PUBLIC_KEY;
export const store=()=>bookingStore('os-events');
export async function authorized(request){try{const timestamp=request.headers.get('X-OS-Timestamp')||'',signature=request.headers.get('X-OS-Signature')||'';if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)return false;const payload=await request.clone().text();if(payload.length>((/\/(?:quotes(?:\/context)?|appointments)$/.test(new URL(request.url).pathname))?250000:12000))return false;const url=new URL(request.url),hash=crypto.createHash('sha256').update(payload).digest('hex'),data=[request.method,url.pathname+url.search,timestamp,hash].join('\n');return crypto.verify(null,Buffer.from(data),crypto.createPublicKey({key:Buffer.from(process.env.TUFF_OS_PUBLIC_KEY||PUBLIC_KEY,'base64'),format:'der',type:'spki'}),Buffer.from(signature,'base64'));}catch{return false;}}
export async function enqueue(event){if(!enabled())return false;await store().setJSON(event.id,event,{onlyIfNew:true});return true;}
export function clean(value,max=200){return String(value||'').trim().slice(0,max);}
export function safePath(value){const path=clean(value).split('?')[0];return /^\/[a-zA-Z0-9_./-]*$/.test(path)?path:'/';}
export function attribution(data){
 const known=(value,max)=>{const v=clean(value,max);return /^(not_set|\(not set\)|unknown|direct_or_unknown)$/i.test(v)?'':v;};
 const tag=(value,max)=>known(value,max).replace(/[^a-zA-Z0-9_ .-]/g,'');
 const clicks=Object.fromEntries(['gclid','gbraid','wbraid'].map(k=>[k,known(data[k],250).replace(/[^a-zA-Z0-9_.-]/g,'')]));
 return {source:tag(data.utm_source,80)|| (Object.values(clicks).some(Boolean)?'google':'unknown'),medium:tag(data.utm_medium,80)||(Object.values(clicks).some(Boolean)?'cpc':''),campaign:tag(data.utm_campaign,100),...clicks,landingPath:safePath(data.landing_page),path:safePath(data.path||data.landing_page)};
}
export function session(request){const raw=(request.headers.get('cookie')||'').match(/(?:^|;\s*)tuff_os_chat=([a-f0-9]{64})(?:;|$)/)?.[1];const token=raw||crypto.randomBytes(32).toString('hex');return {id:crypto.createHash('sha256').update(token).digest('hex'),cookie:raw?null:'tuff_os_chat='+token+'; Path=/.netlify/functions/os-event; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000'};}
