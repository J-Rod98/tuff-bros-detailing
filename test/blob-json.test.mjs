import test from 'node:test';
import assert from 'node:assert/strict';
import {getStore} from '@netlify/blobs';
import {writeJSON} from '../netlify/functions/lib/blob-json.mjs';
test('actual installed Blobs SDK forwards conditional JSON writes and honors 412 conflicts',async()=>{const calls=[];const store=getStore({name:'contract',siteID:'unit-test',token:'not-a-real-token',edgeURL:'https://example.test',fetch:async(url,options)=>{calls.push(options);return new Response('',{status:calls.length===1?200:412,headers:{etag:'version1'}});}});assert.equal((await writeJSON(store,'receipt',{original:true},{onlyIfNew:true})).modified,true);assert.equal(calls[0].headers['if-none-match'],'*');assert.equal(calls[0].body,'{"original":true}');assert.equal((await writeJSON(store,'receipt',{original:false},{onlyIfMatch:'version1'})).modified,false);assert.equal(calls[1].headers['if-match'],'version1');});
