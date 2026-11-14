import {readConfig} from './lib/receptionist.mjs';
import {validSignature,parseEvents,hash} from './lib/facebook-core.mjs';
import {processEvent,queueEvents} from './lib/facebook.mjs';
export default async request=>{
 if(request.method!=='POST')return;
 const raw=await request.text();if(Buffer.byteLength(raw)>200000)return;
 const c=await readConfig();if(!validSignature(raw,request.headers.get('x-hub-signature-256'),c.facebookAppSecret))return;
 const events=parseEvents(JSON.parse(raw));
 await queueEvents(events);
 for(const e of events.sort((a,b)=>a.at-b.at))if(!e.echo)await processEvent('event/'+hash(e.key));
};
