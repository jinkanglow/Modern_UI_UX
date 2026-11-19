import test from 'node:test';
import assert from 'node:assert/strict';
import {validateContract,verifyInteraction,readContract} from '../src/interaction.js';
const base={schema_version:'0.7',id:'form',target:'http://localhost:3000',scenarios:[{id:'happy',steps:[{action:'click',selector:'#go',state:'pending',expect:[{check:'visible',selector:'#status'}]},{action:'click',selector:'#finish',state:'success',expect:[{check:'text',selector:'#status',equals:'Done'}]}]}]};
const clone=()=>structuredClone(base);
function adapter({failAction=false,failCheck=false,failOpen=false}={}){const calls=[];return {calls,async open(t){calls.push('open');if(failOpen)throw Error('navigation failed');},async perform(s){calls.push(s.action);if(failAction)throw Error('action failed');},async assert(a){calls.push(a.check);if(failCheck)throw Error('assertion failed');},async close(){calls.push('close');}};}
test('valid contract accepted',()=>assert.deepEqual(validateContract(base),[]));
test('rejects invalid state transition',()=>{const c=clone();c.scenarios[0].steps[0].state='success';c.scenarios[0].steps[1].state='pending';assert.match(validateContract(c).join(' '),/transition success -> pending/);});
test('rejects missing selectors and unsupported actions',()=>{const c=clone();c.scenarios[0].steps[0].action='eval';delete c.scenarios[0].steps[0].selector;assert.match(validateContract(c).join(' '),/action invalid/);assert.match(validateContract(c).join(' '),/selector required/);});
test('rejects invalid assertions and timeouts',()=>{const c=clone();c.timeout_ms=100000;c.scenarios[0].steps[0].expect=[{check:'text',selector:'#x'}];assert.match(validateContract(c).join(' '),/timeout_ms/);assert.match(validateContract(c).join(' '),/equals/);});
test('rejects duplicate scenario IDs',()=>{const c=clone();c.scenarios.push(structuredClone(c.scenarios[0]));assert.match(validateContract(c).join(' '),/unique/);});
test('successful contract executes all steps and closes adapter',async()=>{const a=adapter();const r=await verifyInteraction(base,a);assert.equal(r.counts.passed,1);assert.equal(r.counts.failed,0);assert.equal(a.calls.at(-1),'close');});
test('assertion failure is reported with evidence and halts scenario',async()=>{const a=adapter({failCheck:true});const r=await verifyInteraction(base,a);assert.equal(r.counts.failed,1);assert.equal(r.findings[0].rule_id,'FLOW-ASSERTION_FAILED');assert.equal(r.scenarios[0].steps.length,1);assert.equal(a.calls.at(-1),'close');});
test('action failure reports error and closes',async()=>{const a=adapter({failAction:true});const r=await verifyInteraction(base,a);assert.equal(r.findings[0].rule_id,'FLOW-ACTION_FAILED');assert.equal(a.calls.at(-1),'close');});
test('navigation failure does not execute steps',async()=>{const a=adapter({failOpen:true});const r=await verifyInteraction(base,a);assert.equal(r.findings[0].rule_id,'FLOW-NAVIGATION_FAILED');assert.deepEqual(a.calls,['open','close']);});
test('fixture contract resolves local HTML path',()=>{const c=readContract('examples/interaction/contract.json');assert.match(c.target,/form\.html$/);assert.equal(c.scenarios.length,2);});
test('wait action requires bounded duration',()=>{const c=clone();c.scenarios[0].steps[0]={action:'wait',ms:9999,expect:[{check:'visible',selector:'#x'}]};assert.match(validateContract(c).join(' '),/ms must be 0\.\.5000/);});
test('state names are not represented as observed DOM proof',async()=>{const r=await verifyInteraction(base,adapter());assert.match(r.limitations.join(' '),/explicit DOM assertions/);});
