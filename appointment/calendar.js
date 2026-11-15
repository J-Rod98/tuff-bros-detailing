export const timezone='America/Chicago';
const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function centralInstant(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Appointment time is not confirmed.');
 const target=Date.parse(date+'T'+time+':00Z');let instant=target;
 for(let i=0;i<3;i++){const p=parts(new Date(instant)),shown=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);instant+=target-shown;}
 const p=parts(new Date(instant));if(`${p.year}-${p.month}-${p.day}`!==date||`${p.hour}:${p.minute}`!==time)throw Error('Appointment time needs confirmation.');return new Date(instant);
}
const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function calendarEvent(a){
 if(!['Confirmed','Rescheduled'].includes(a.status)||!a.location.confirmed||!['mobile','dropoff'].includes(a.serviceType))throw Error('Confirm the appointment time and location with Tuff Bros before adding it to your calendar.');
 const start=centralInstant(a.appointment.date,a.appointment.startTime),end=new Date(start.getTime()+a.appointment.durationMinutes*60000),drop=a.serviceType==='dropoff';
 return {start,end,title:`Tuff Bros · ${drop?'Vehicle drop-off':'Mobile detailing'}`,location:a.location.address,description:[drop?'Bring your vehicle and keys to the confirmed drop-off location.':'Tuff Bros will arrive at your confirmed service address.',a.vehicle,a.services.map(l=>l.description).join(' · '),'Times are in Central Time. Service duration is estimated; the calendar end is not a guaranteed completion or pickup time.',a.pickupInstructions||'','Contact Tuff Bros to request a change. Changes require owner approval.'].filter(Boolean).join('\n')};
}
export function googleCalendarUrl(a){const e=calendarEvent(a),url=new URL('https://calendar.google.com/calendar/render');url.search=new URLSearchParams({action:'TEMPLATE',text:e.title,dates:stamp(e.start)+'/'+stamp(e.end),ctz:timezone,location:e.location,details:e.description});return url.href;}
const escapeText=v=>String(v).replace(/\\/g,'\\\\').replace(/\r?\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let out='',current='';for(const c of line){if(new TextEncoder().encode(current+c).length>75){out+=current+'\r\n';current=' ';}current+=c;}return out+current;}
export function calendarICS(a,uid,now=new Date()){
 const e=calendarEvent(a);if(!/^[a-f0-9]{64}$/.test(uid))throw Error('Calendar identifier is unavailable. Refresh this page.');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tuff Bros//Appointment//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-TIMEZONE:'+timezone,'BEGIN:VEVENT','UID:'+uid+'@tuffbrosdetailing.com','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(e.start),'DTEND:'+stamp(e.end),'SUMMARY:'+escapeText(e.title),'LOCATION:'+escapeText(e.location),'DESCRIPTION:'+escapeText(e.description),'STATUS:CONFIRMED','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export const directionsUrl=address=>'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination:address});
export function phoneHref(number,scheme='tel'){const n=String(number||'').replace(/[^\d+]/g,'');return /^\+?\d{8,15}$/.test(n)?scheme+':'+n:'';}
export const dateLabel=slot=>new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(centralInstant(slot.date,slot.startTime));
export const timeLabel=slot=>new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'}).format(centralInstant(slot.date,slot.startTime));
export const durationLabel=minutes=>[Math.floor(minutes/60)?`${Math.floor(minutes/60)} hr`:'',minutes%60?`${minutes%60} min`:''].filter(Boolean).join(' ');

export function requestChangeHref(number,message,ios=false){const href=phoneHref(number,'sms');return href?href+(ios?'&':'?')+'body='+encodeURIComponent(message):'';}
