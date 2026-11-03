// Conservative display prefills only. The customer must enter/confirm a street address.
export const isStreetAddress=value=>/^\d+[A-Za-z0-9-]*\s+\S/.test(String(value||'').trim());
const states={Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC'};
export function addressPrefill(contact={},location=''){
 const raw=String(contact.address||location||'').trim(),parts=raw.split(',').map(v=>v.trim()).filter(Boolean),result={propertyName:'',street:'',unit:'',city:'',state:'',zip:''};
 let region=-1;
 for(let i=parts.length-1;i>=0;i--){const piece=parts[i],match=piece.match(/^(.+?)(?:\s+(\d{5}(?:-\d{4})?))?$/),name=match?.[1]||'',state=Object.entries(states).find(([label,code])=>label.toLowerCase()===name.toLowerCase()||code===name.toUpperCase());if(state){result.state=state[1];result.zip=match?.[2]||'';region=i;break;}}
 const streetIndex=parts.findIndex(isStreetAddress);if(streetIndex>=0)result.street=parts[streetIndex];
 const unitIndex=parts.findIndex(v=>/^(?:apt\.?|apartment|unit|suite|rv\s+lot|lot|site|spot)\s*[#\w-]+$/i.test(v));if(unitIndex>=0)result.unit=parts[unitIndex];
 const cityIndex=region-1;if(cityIndex>=0&&cityIndex!==streetIndex&&cityIndex!==unitIndex&&!/\b(park|resort|campground|lot|site)\b/i.test(parts[cityIndex]))result.city=parts[cityIndex];
 if(parts[0]&&!isStreetAddress(parts[0])&&0!==cityIndex&&0!==region&&0!==unitIndex||parts[0]&&/\b(park|resort|campground)\b/i.test(parts[0]))result.propertyName=parts[0];
 if(!result.city&&result.propertyName){const known=['North Little Rock','Little Rock','Sherwood','Maumelle','Conway','Cabot','Jacksonville','Benton','Bryant'].find(city=>result.propertyName.toLowerCase().startsWith(city.toLowerCase()+' '));if(known)result.city=known;}
 for(const key of Object.keys(result))if(typeof contact[key]==='string'&&contact[key].trim())result[key]=contact[key].trim();
 if(!isStreetAddress(result.street)){if(result.street&&!result.propertyName)result.propertyName=result.street;result.street='';}
 return result;
}
