import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contractFingerprint} from '../src/interaction.js';
import {auditObservedCausality} from '../src/continuous-v43.js';
const contract=JSON.parse(fs.readFileSync(new URL('../examples/frameworks/interaction-contract.json',import.meta.url)));
const policy=JSON.parse(fs.readFileSync(new URL('../examples/continuous/policy.json',import.meta.url)));
function run(change=()=>{}){const obs={status:'CAPTURED',events:[{state:'idle',at_ms:0},{state:'pending',at_ms:5},{state:'success',at_ms:30}],requests:[{id:1,kind:'request',matched:true,at_ms:10},{id:1,kind:'response',status:200,at_ms:20}],overflow:false};change(obs);return auditObservedCausality(policy,contract,{contract_sha256:contractFingerprint(contract),scenarios:[{id:'save-no-duplicate',observation:obs}]});}
test('ordered success is observed contract match',()=>assert.equal(run().status,'OBSERVED_CONTRACT_MATCH'));
test('unresolved request is not verified',()=>assert.equal(run(o=>o.requests.pop()).scenarios[0].status,'NOT_VERIFIED'));
test('duplicate request IDs are rejected',()=>assert.ok(run(o=>o.requests.push({id:1,kind:'request',matched:true,at_ms:40})).scenarios[0].issues.some(x=>x.code==='DUPLICATE_REQUEST_ID')));
test('overlapping requests are flagged',()=>assert.ok(run(o=>o.requests.splice(1,0,{id:2,kind:'request',matched:true,at_ms:12})).scenarios[0].issues.some(x=>x.code==='OVERLAPPING_REQUESTS')));
test('success after failed request is rejected',()=>assert.ok(run(o=>o.requests[1]={id:1,kind:'failed',at_ms:20}).scenarios[0].issues.some(x=>x.code==='SUCCESS_AFTER_NETWORK_FAILURE')));
test('success after HTTP 503 is rejected',()=>assert.ok(run(o=>o.requests[1].status=503).scenarios[0].issues.some(x=>x.code==='SUCCESS_AFTER_HTTP_ERROR')));
test('cross-clock timestamps do not produce invented ordering findings',()=>assert.ok(!run(o=>o.events[2].at_ms=15).scenarios[0].issues.some(x=>x.code==='TERMINAL_BEFORE_NETWORK_OUTCOME')));
test('network overflow cannot pass',()=>assert.equal(run(o=>o.network_overflow=true).scenarios[0].status,'NOT_VERIFIED'));
test('missing observation cannot pass',()=>assert.equal(auditObservedCausality(policy,contract,{contract_sha256:contractFingerprint(contract),scenarios:[]}).status,'BLOCK'));
