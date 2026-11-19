import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assuranceReport,executeAssuranceSafely} from '../src/assurance.js';
import {contractFingerprint} from '../src/interaction.js';
const contract=JSON.parse(fs.readFileSync('examples/frameworks/interaction-contract.json','utf8'));
const tasks=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
test('missing browser dependency is infrastructure error, not a UX failure',async()=>{
 const result=await executeAssuranceSafely({contract,tasks,adapterFactory:async()=>{throw Error('Playwright unavailable: /private/secret?token=abc');}});
 assert.equal(result.assurance.gate.status,'INFRA_ERROR');assert.equal(result.assurance.execution.category,'BROWSER_UNAVAILABLE');
 assert.equal(result.interaction,null);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('unexpected runner exception fails closed without raw details',async()=>{
 const result=await executeAssuranceSafely({contract,tasks,adapterFactory:async()=>{throw Error('secret runner failure');}});
 assert.equal(result.assurance.execution.category,'RUNNER_FAILURE');assert.equal(result.assurance.gate.blocks_ci,true);
 assert.ok(!JSON.stringify(result).includes('secret'));
});
test('invalid input is not disguised as browser infrastructure failure',async()=>{
 await assert.rejects(()=>executeAssuranceSafely({contract:{...contract,id:''},tasks,adapterFactory:async()=>{throw Error('should not run');}}),/Invalid contract/);
});
test('navigation failures are not misclassified as UX assertion defects',()=>{
 const report={mode:'interaction',contract_id:contract.id,contract_sha256:contractFingerprint(contract),
  scenarios:contract.scenarios.map((s,i)=>({id:s.id,status:i===0?'FAIL':'PASS',steps:i===0?[]:s.steps.map((step,j)=>({index:j+1,action:step.action,status:'PASS',checks:step.expect.map(a=>({check:a.check,status:'PASS'}))}))})),
  findings:[{rule_id:'FLOW-NAVIGATION_FAILED',scenario:contract.scenarios[0].id,step:0}],artifacts:[],
  counts:{scenarios:contract.scenarios.length,passed:contract.scenarios.length-1,failed:1}};
 const result=assuranceReport({contract,tasks,interaction:report});
 assert.equal(result.gate.status,'INFRA_ERROR');assert.equal(result.gate.blocks_ci,true);
});
