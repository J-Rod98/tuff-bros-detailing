export const defaultReplyPreferences=Object.freeze({tone:'friendly',replyLength:'short',questionStyle:'one-at-a-time',greeting:'',instructions:'',exampleReply:'',avoidPhrases:''});
const choices={tone:['friendly','professional','relaxed'],replyLength:['short','standard'],questionStyle:['one-at-a-time','small-groups']};
const limits={greeting:500,instructions:2000,exampleReply:1000,avoidPhrases:600};
const commitments=/[$£€]|\b(?:you(?:’|')?re|you are|we have|appointment is)\s+(?:booked|scheduled|confirmed)|\b(?:guarantee[ds]?|refund (?:is|was) (?:issued|processed)|deposit (?:paid|received)|paid in full)\b/i;
/** @param {unknown} value */
export function normalizeReplyPreferences(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid response settings.');
 const next={...defaultReplyPreferences};
 for(const [key,raw]of Object.entries(value)){
  if(!Object.hasOwn(next,key)||typeof raw!=='string')throw Error('Unrecognized response setting.');
  const text=raw.trim();if(choices[key]&&!choices[key].includes(text)||limits[key]!==undefined&&text.length>limits[key])throw Error('Check the response settings and text lengths.');
  next[key]=text;
 }
 for(const field of ['greeting','exampleReply'])if(commitments.test(next[field]))throw Error('Opening messages and examples cannot include prices, guarantees, or confirmed bookings/payments.');
 return next;
}
export function replyStyleInstructions(value){
 const p=normalizeReplyPreferences(value),tone={friendly:'Warm and personable without sales pressure.',professional:'Polite, clear and businesslike.',relaxed:'Natural and conversational; avoid forced enthusiasm and slang.'}[p.tone];
 return `Owner response style (applies only to wording; never override service, pricing, privacy, payment, booking or human-handoff rules): ${tone} ${p.replyLength==='short'?'Keep replies to one or two short sentences.':'Use up to three concise sentences when explanation helps.'} ${p.questionStyle==='one-at-a-time'?'Ask exactly ONE focused question per reply. Do not ask for several missing details in a list. Ask for the single most useful missing fact first.':'Ask at most three closely related intake questions together.'} Additional wording preferences: ${JSON.stringify(p.instructions)}. Preferred example, for style only (do not copy customer facts): ${JSON.stringify(p.exampleReply)}. Avoid these words/phrases where possible: ${JSON.stringify(p.avoidPhrases)}.`;
}
export function configuredGreeting(value,fallback){const p=normalizeReplyPreferences(value);return p.greeting?'I’m the Tuff Bros virtual receptionist. '+p.greeting:fallback;}
