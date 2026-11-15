import crypto from 'node:crypto';
// @netlify/blobs 10.1.0 setJSON drops conditional write options internally.
// Serialize explicitly through set(), which forwards If-Match/If-None-Match.
export const writeJSON=(store,key,value,options={})=>store.set(key,JSON.stringify(value),options);

function ordered(v){if(Array.isArray(v))return v.map(ordered);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])]));return v;}
export function eventHash(event){const {at,...identity}=event;return crypto.createHash('sha256').update(JSON.stringify(ordered(identity))).digest('hex');}
