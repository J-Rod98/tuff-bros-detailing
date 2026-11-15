import {appointmentView,esc} from './view.js';
import {calendarICS} from './calendar.js';
const el=document.getElementById('appointment-content'),notice=document.getElementById('refresh-notice');let activeToken='',requestNumber=0,current=null;
async function load({manual=false}={}){
 const token=location.hash.slice(1),id=++requestNumber;if(token!==activeToken){el.innerHTML='<h1>Opening your appointment…</h1>';current=null;activeToken=token;}notice.textContent='';
 try{
  if(!/^[a-f0-9]{64}$/.test(token))throw Object.assign(Error('Open the complete private appointment link provided by Tuff Bros.'),{invalid:true});
  const response=await fetch('/.netlify/functions/customer-appointment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',token}),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)}),data=await response.json();if(id!==requestNumber||location.hash.slice(1)!==token)return;
  if(!response.ok)throw Object.assign(Error(data.error||'Please try again.'),{invalid:[404,410].includes(response.status)});
  const rendered=appointmentView(data.appointment,data,{ios:/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1});
  if(JSON.stringify(data)!==JSON.stringify(current)||manual){el.innerHTML=rendered;current=data;
   document.getElementById('refresh-appointment').onclick=()=>load({manual:true});
   const download=document.getElementById('download-calendar');if(download)download.onclick=()=>{try{const content=calendarICS(data.appointment,data.appointment.calendarUid),url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Tuff-Bros-Appointment.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notice.textContent=e.message;}};
  }
  if(data.syncPending)notice.textContent='Showing the last published details. Live OS refresh is temporarily unavailable; contact Tuff Bros to verify recent changes.';else if(manual)notice.textContent='Appointment details are up to date.';
 }catch(e){if(id!==requestNumber||location.hash.slice(1)!==token)return;if(current&&!e.invalid){notice.textContent='Unable to refresh. The details below may be out of date. Please try again or contact Tuff Bros.';return;}current=null;el.innerHTML=`<section class="card error-card"><div class="eyebrow">TUFF BROS MOBILE DETAILING</div><h1>We couldn’t open this appointment</h1><p>${esc(e.invalid?e.message:'Please check your connection and try again.')}</p><p>Your booking is saved with Tuff Bros. Contact us using the number in your booking message if you need help.</p><button type="button" class="action primary" id="retry-appointment">Try again</button></section>`;document.getElementById('retry-appointment').onclick=()=>load({manual:true});}
}
await load();setInterval(()=>{if(!document.hidden)load();},60000);addEventListener('hashchange',()=>load());document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
