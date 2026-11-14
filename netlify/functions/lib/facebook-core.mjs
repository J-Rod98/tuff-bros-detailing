import crypto from 'node:crypto';
export const PAGE_ID='794494190410669';
export const APP_ID='1501428735133190';
export const CALLBACK='https://tuffbrosdetailing.com/.netlify/functions/receptionist-facebook';
export const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const eventId=value=>{const h=hash(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
export function validSignature(raw,signature,secret){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const expected=crypto.createHmac('sha256',secret).update(raw).digest();
 return crypto.timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export function normalizeFacebook(value={}){
 const forms=Array.isArray(value.formIds)?[...new Set(value.formIds)]:[];
 if(forms.length>30||forms.some(id=>!/^\d{5,30}$/.test(id)))throw Error('Enter the reviewed Facebook form IDs.');
 const replyTo=String(value.replyTo||'').trim();
 if(replyTo&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo))throw Error('Enter a monitored reply email.');
 return {messengerEnabled:value.messengerEnabled===true,leadEmailEnabled:value.leadEmailEnabled===true,customerAccessConfirmed:value.customerAccessConfirmed===true,otherRespondersOff:value.otherRespondersOff===true,formIds:forms,replyTo};
}
export function facebookBlockers(c,health={},requireFresh=true){
 const common=[];if(!c.apiKey)common.push('Connect the receptionist AI key.');
 if(!c.facebookPageToken)common.push('Connect the Tuff Bros Page token.');
 if(!c.facebookAppSecret||!c.facebookVerifyToken)common.push('Connect the Meta app secret in the secure form.');
 if(!health.verifiedAt)common.push('Verify the callback URL in Meta.');
 if(!health.checkedAt||requireFresh&&(!Number.isFinite(Date.parse(health.checkedAt))||Date.now()-Date.parse(health.checkedAt)>3600000))common.push('Check the Page connection and subscriptions.');
 if(!c.facebook?.customerAccessConfirmed)common.push('Complete Meta customer-access approval, then confirm it here.');
 const messenger=[...common],email=[...common];
 if(!health.subscriptions?.includes('messages'))messenger.push('Subscribe the Page to messages.');
 if(!health.subscriptions?.includes('message_echoes'))messenger.push('Subscribe the Page to message_echoes for human takeover.');
 if(!c.facebook?.otherRespondersOff)messenger.push('Turn off competing Facebook AI and instant replies, then confirm here.');
 if(!health.subscriptions?.includes('leadgen'))email.push('Subscribe the Page to leadgen.');
 if(!c.resendKey||!c.fromEmail)email.push('Connect your email sender in Apps & integrations.');
 if(!c.facebook?.replyTo)email.push('Set a monitored email for customer replies.');
 if(!c.facebook?.formIds?.length)email.push('Choose the lead forms reviewed for email follow-up.');
 return {messenger,email};
}
export function parseEvents(payload){
 if(payload?.object!=='page'||!Array.isArray(payload.entry))return [];
 const events=[];
 for(const entry of payload.entry){if(String(entry.id)!==PAGE_ID)continue;
  for(const m of entry.messaging||[]){
   if(!m.message?.mid)continue;
   const echo=m.message.is_echo===true;
   if(String(echo?m.sender?.id:m.recipient?.id)!==PAGE_ID)continue;
   const psid=String(echo?m.recipient?.id:m.sender?.id);
   if(!/^\d{5,30}$/.test(psid)||psid===PAGE_ID)continue;
   events.push({key:'messenger:'+m.message.mid,channel:'messenger',psid,at:Number(m.timestamp),body:String(m.message.text||'').slice(0,4000),attachment:!!m.message.attachments?.length,echo,appId:String(m.message.app_id||'')});
  }
  for(const change of entry.changes||[]){const v=change.value;
   if(change.field!=='leadgen'||String(v?.page_id)!==PAGE_ID||!/^\d{5,30}$/.test(String(v?.leadgen_id))||!/^\d{5,30}$/.test(String(v?.form_id)))continue;
   events.push({key:'lead:'+v.leadgen_id,channel:'facebook-email',leadId:String(v.leadgen_id),formId:String(v.form_id),at:Number(v.created_time)*1000});
  }
 }
 if(events.length>100)throw Error('Webhook batch too large.');
 return events.filter(e=>Number.isFinite(e.at)&&e.at>0);
}
export function eligibleEvent(e,c,now=Date.now()){
 const f=c.facebook||{},enabled=e.channel==='messenger'?f.messengerEnabled:f.leadEmailEnabled,since=e.channel==='messenger'?f.messengerSince:f.emailSince;
 if(!enabled)return 'Channel is off. Saved for review.';
 if(!since||e.at<Date.parse(since))return 'Historical event. No automatic follow-up.';
 if(e.at>now+300000||now-e.at>3600000)return 'Event is stale or its timestamp needs review.';
 if(e.channel==='facebook-email'&&!f.formIds?.includes(e.formId))return 'This form has not been selected for email follow-up.';
 return '';
}
