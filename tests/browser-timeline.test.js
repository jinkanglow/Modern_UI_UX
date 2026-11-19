import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyInteraction,contractFingerprint} from '../src/interaction.js';
import {browserTimeline} from '../src/browser-timeline.js';
const contract=JSON.parse(fs.readFileSync(new URL('../examples/frameworks/interaction-contract.json',import.meta.url)));
const scenario=contract.scenarios[1];
const ref=(step,check_index)=>({scenario:scenario.id,step,check_index});
const policy={schema_version:'3.9',contract_id:contract.id,flows:[{id:'save',scenario:scenario.id,kind:'ordinary',states:['idle','pending','success'],required_evidence:[{id:'input',kind:'dom_assertion',purpose:'state'}]}]};
const bindings={schema_version:'4.0',contract_id:contract.id,flows:[{id:'save',state_bindings:[{state:'idle',assertion:ref(1,0)},{state:'pending',assertion:ref(2,0)},{state:'success',assertion:ref(2,2)}],evidence_bindings:[{id:'input',assertion:ref(1,0)}]}]};
function report(timed=true){return {contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map((check,j)=>({check:check.check,status:'PASS',...(timed?{timing:{start_ms:i*100+j*10,end_ms:i*100+j*10+1}}:{})}))}))})),findings:[],counts:{scenarios:contract.scenarios.length,passed:contract.scenarios.length,failed:0}};}
test('monotonic assertion timestamps accepted with limited claim',()=>{const result=browserTimeline(bindings,policy,contract,report());assert.equal(result.status,'ASSERTIONS_TIMED');assert.equal(result.flows[0].events.length,3);assert.match(result.limitations.join(' '),/not when application state changed/);});
test('legacy reports without timestamps remain unverified',()=>assert.equal(browserTimeline(bindings,policy,contract,report(false)).flows[0].status,'TIMING_UNVERIFIED'));
test('reversed timestamps rejected',()=>{const r=report();r.scenarios[1].steps[1].checks[0].timing={start_ms:0,end_ms:1};assert.equal(browserTimeline(bindings,policy,contract,r).flows[0].status,'TIMELINE_INCONSISTENT');});
test('negative and impossible intervals are unverified',()=>{for(const timing of [{start_ms:-1,end_ms:2},{start_ms:10,end_ms:9},{start_ms:'10',end_ms:11}]){const r=report();r.scenarios[1].steps[0].checks[0].timing=timing;assert.equal(browserTimeline(bindings,policy,contract,r).flows[0].status,'TIMING_UNVERIFIED');}});
test('fingerprint mismatch rejected',()=>{const r=report();r.contract_sha256='invalid';assert.throws(()=>browserTimeline(bindings,policy,contract,r),/fingerprint/);});
test('real engine emits monotonic timings on successful assertions',async()=>{const adapter={async open(){},async perform(){},async assert(){},async close(){}};const r=await verifyInteraction(contract,adapter);assert.equal(browserTimeline(bindings,policy,contract,r).status,'ASSERTIONS_TIMED');});
test('failed assertion cannot be timed as a successful state',async()=>{let calls=0;const adapter={async open(){},async perform(){},async assert(){if(++calls===scenario.steps[0].expect.length+contract.scenarios[0].steps.reduce((n,s)=>n+s.expect.length,0)+1)throw Error('failure');},async close(){}};const r=await verifyInteraction(contract,adapter);assert.notEqual(browserTimeline(bindings,policy,contract,r).status,'ASSERTIONS_TIMED');});
