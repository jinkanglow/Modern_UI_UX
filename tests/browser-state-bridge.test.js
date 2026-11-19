import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contractFingerprint} from '../src/interaction.js';
import {validateBrowserBindings,bridgeBrowserReport,executeBrowserState} from '../src/browser-state-bridge.js';
const contract=JSON.parse(fs.readFileSync(new URL('../examples/frameworks/interaction-contract.json',import.meta.url)));
const scenario=contract.scenarios[1];
const ref=(step,check_index)=>({scenario:scenario.id,step,check_index});
const policy={schema_version:'3.9',contract_id:contract.id,flows:[{id:'save',scenario:scenario.id,kind:'ordinary',states:['idle','pending','success'],required_evidence:[{id:'input',kind:'dom_assertion',purpose:'state'},{id:'request',kind:'network_observation',purpose:'outcome'}]}]};
const bindings={schema_version:'4.0',contract_id:contract.id,flows:[{id:'save',state_bindings:[{state:'idle',assertion:ref(1,0)},{state:'pending',assertion:ref(2,0)},{state:'success',assertion:ref(2,2)}],evidence_bindings:[{id:'input',assertion:ref(1,0)},{id:'request',assertion:ref(2,1)}]}]};
function report(){return {contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map(check=>({check:check.check,status:'PASS'}))}))})),findings:[],counts:{scenarios:contract.scenarios.length,passed:contract.scenarios.length,failed:0}};}
test('valid binding',()=>assert.deepEqual(validateBrowserBindings(bindings,policy,contract),[]));
test('all bound assertions produce contract pass only',()=>{const r=bridgeBrowserReport(bindings,policy,contract,report());assert.equal(r.flows[0].status,'CONTRACT_PASS');assert.equal(r.flows[0].business_completion_claim,'NOT_ESTABLISHED');assert.equal(r.observation_source,'BROWSER_REPORT_UNAUTHENTICATED');});
test('missing assertion cannot be inferred from declared state',()=>{const r=report();r.scenarios[1].steps[1].checks.pop();r.scenarios[1].steps[1].status='FAIL';r.scenarios[1].status='FAIL';r.counts.passed--;r.counts.failed++;assert.equal(bridgeBrowserReport(bindings,policy,contract,r).flows[0].status,'NOT_VERIFIED');});
test('failed bound assertion produces FAIL',()=>{const r=report();r.scenarios[1].steps[1].checks[1].status='FAIL';r.scenarios[1].steps[1].status='FAIL';r.scenarios[1].status='FAIL';r.counts.passed--;r.counts.failed++;assert.equal(bridgeBrowserReport(bindings,policy,contract,r).flows[0].status,'FAIL');});
test('tampered report counts rejected',()=>{const r=report();r.counts.failed=1;assert.throws(()=>bridgeBrowserReport(bindings,policy,contract,r),/integrity/);});
test('mismatched contract rejected',()=>{const r=report();r.contract_sha256='x';assert.throws(()=>bridgeBrowserReport(bindings,policy,contract,r),/fingerprint/);});
test('undeclared assertion rejected',()=>{const b=structuredClone(bindings);b.flows[0].state_bindings[1].assertion.step=99;assert.match(validateBrowserBindings(b,policy,contract).join(),/invalid state assertion/);});
test('human authorization cannot be sourced from DOM assertion',()=>{const p=structuredClone(policy),b=structuredClone(bindings);p.flows[0].kind='agent_action';p.flows[0].required_evidence.push({id:'consent',kind:'human_review',purpose:'authorization'});b.flows[0].evidence_bindings.push({id:'consent',assertion:ref(1,0)});assert.match(validateBrowserBindings(b,p,contract).join(),/unsupported evidence/);});
test('execution calls adapter and preserves untrusted evidence boundary',async()=>{const adapter={async open(){},async perform(){},async assert(){},async close(){}};const {result}=await executeBrowserState(bindings,policy,contract,adapter);assert.equal(result.flows[0].status,'CONTRACT_PASS');});

test('out-of-order state evidence rejected',()=>{const b=structuredClone(bindings);b.flows[0].state_bindings.reverse();assert.match(validateBrowserBindings(b,policy,contract).join(),/state order mismatch/);});
