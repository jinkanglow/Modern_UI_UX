import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contractFingerprint,verifyInteraction} from '../src/interaction.js';
import {validateObservationPolicy,evaluateContinuousObservations} from '../src/continuous-observer.js';
const contract=JSON.parse(fs.readFileSync(new URL('../examples/frameworks/interaction-contract.json',import.meta.url)));
const policy=JSON.parse(fs.readFileSync(new URL('../examples/continuous/policy.json',import.meta.url)));
const events=['idle','pending','success'].map((state,i)=>({state,at_ms:i*10}));
const requests=[{id:1,kind:'request',matched:true,at_ms:12},{id:1,kind:'response',status:200,at_ms:18}];
function report(observation){return {contract_sha256:contractFingerprint(contract),scenarios:[{id:'save-no-duplicate',observation}]};}
function evaluate(o){return evaluateContinuousObservations(policy,contract,report(o));}
const good=()=>({status:'CAPTURED',events:structuredClone(events),requests:structuredClone(requests),overflow:false});
test('valid policy and observed DOM/network sequence',()=>{assert.deepEqual(validateObservationPolicy(policy,contract),[]);assert.equal(evaluate(good()).status,'OBSERVED_CONTRACT_MATCH');});
test('missing observation cannot pass',()=>assert.equal(evaluate(null).scenarios[0].status,'NOT_VERIFIED'));
test('transient pending state omission fails',()=>{const o=good();o.events.splice(1,1);assert.equal(evaluate(o).status,'BLOCK');});
test('duplicate submission detected by request count',()=>{const o=good();o.requests.push({id:2,kind:'request',matched:true,at_ms:13});assert.match(evaluate(o).scenarios[0].issues.join(' '),/Expected one matching request/);});
test('network response before request rejected',()=>{const o=good();o.requests[1].at_ms=1;assert.match(evaluate(o).scenarios[0].issues.join(' '),/predates/);});
test('illegal state transition rejected',()=>{const o=good();o.events=[{state:'idle',at_ms:0},{state:'success',at_ms:10},{state:'pending',at_ms:20}];assert.match(evaluate(o).scenarios[0].issues.join(' '),/Illegal transition/);});
test('event overflow cannot pass',()=>{const o=good();o.overflow=true;assert.equal(evaluate(o).scenarios[0].status,'NOT_VERIFIED');});
test('invalid timestamps cannot pass',()=>{const o=good();o.events[1].at_ms=-1;assert.equal(evaluate(o).status,'BLOCK');});
test('missing network outcome is unverified',()=>{const o=good();o.requests.pop();assert.equal(evaluate(o).status,'BLOCK');});
test('fingerprint mismatch rejected',()=>assert.throws(()=>evaluateContinuousObservations(policy,contract,{contract_sha256:'x'}),/fingerprint/));
test('engine attaches observations from an adapter',async()=>{const adapter={async open(){},async perform(){},async assert(){},async collectObservation(){return good();},async close(){}};const r=await verifyInteraction(contract,adapter,{observation_policy:policy});assert.equal(evaluateContinuousObservations(policy,contract,r).status,'OBSERVED_CONTRACT_MATCH');});
