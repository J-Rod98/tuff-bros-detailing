import {isStreetAddress} from './address-model.js';
export const acknowledgmentText='I have reviewed the selected services, total price, and Service Details & Important Information, including all exclusions.';
const clean=(v,n)=>{if(typeof v!=='string'||v.trim().length>n)throw Error('Please check your contact and address details.');return v.trim();};
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T12:00Z'))&&new Date(v+'T12:00Z').toISOString().slice(0,10)===v;
const time=v=>/^(0\d|1\d|2[0-3]):[0-5]\d$/.test(v);
export function responseDetails(v,snapshot,snapshotHash,at,appointments=snapshot.appointments){
 const option=snapshot.options.find(o=>o.id===v.optionId);if(!option||!['Accepted','Changes requested','Declined'].includes(v.decision)||v.confirm!==true)throw Error('Select a service and response, and acknowledge the service information.');
 const c={propertyName:'',...v.contact},contact=Object.fromEntries(Object.entries({name:100,phone:30,email:200,propertyName:100,street:150,unit:60,city:80,state:40,zip:10}).map(([k,n])=>[k,clean(c[k],n)]));
 if(!contact.name||!contact.street||!contact.city||!contact.state||!/^\d{5}(-\d{4})?$/.test(contact.zip))throw Error('Enter your name and complete service address, including ZIP code.');
 if(!isStreetAddress(contact.street))throw Error('Enter the street number and street name. Put the park or business name in the separate property field.');
 if(contact.phone&&(!/^\+?[\d\s().-]{8,30}$/.test(contact.phone)||!/^[1-9]\d{7,14}$/.test(contact.phone.replace(/\D/g,''))))throw Error('Enter a complete phone number.');
 if(addressText(contact).length>300)throw Error('Please shorten the service address to 300 characters.');
 if(contact.email&&!/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i.test(contact.email))throw Error('Enter a valid email address.');
 const proposal=appointments?.[option.id],choice=v.decision==='Accepted'?v.scheduling?.response:'Not requested';let date='',startTime='';
 if(choice==='Proposed time accepted'){if(!proposal||!day(proposal.date)||!time(proposal.startTime))throw Error('No proposed appointment is available. Request your preferred date and time.');if(v.scheduling.date!==proposal.date||v.scheduling.startTime!==proposal.startTime)throw Error('The proposed appointment changed. Refresh and review it before responding.');date=proposal.date;startTime=proposal.startTime;}
 else if(choice==='Alternative requested'){date=v.scheduling.date;startTime=v.scheduling.startTime;if(!day(date)||!time(startTime))throw Error('Choose your preferred appointment date and time.');}
 else if(v.decision==='Accepted')throw Error('Choose an appointment preference.');
 else if(choice!=='Not requested')throw Error('Choose an appointment preference.');
 return {name:contact.name,contact,scheduling:{response:choice,date,startTime,timezone:'America/Chicago',appointmentStatus:'Pending business confirmation'},acknowledgment:{statement:acknowledgmentText,exclusions:option.exclusions||'',snapshotHash,at},quoteVersion:JSON.stringify(snapshot)};
}
export const addressText=c=>[c.street,c.unit,[c.city,c.state,c.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
export function appointmentText(s){return s?.date&&s?.startTime?new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Chicago'}).format(new Date(s.date+'T12:00Z'))+' · '+new Date('2000-01-01T'+s.startTime+':00Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' Central Time':'No appointment proposed yet';}
