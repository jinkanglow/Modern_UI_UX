import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executeAssurance,assuranceReport} from '../src/assurance.js';
import {contractFingerprint} from '../src/interaction.js';
const contract=JSON.parse(fs.readFileSync('examples/frameworks/interaction-contract.json','utf8'));
const tasks=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
function fakeAdapter({fail=false}={}){
 let opened=0,closed=0;
 const adapter={async open(){opened++},async perform(){},async assert(){if(fail)throw Error('Test assertion failed')},async close(){closed++}};
 return {adapter,stats:()=>({opened,closed})};
}
test('in-process execution verifies declared tasks and marks provenance without attestation',async()=>{
 const {adapter,stats}=fakeAdapter();
 const result=await executeAssurance({contract,tasks,adapterFactory:async()=>adapter});
 assert.equal(result.assurance.gate.status,'CONTRACT_PASS');
 assert.equal(result.assurance.execution.status,'IN_PROCESS_OBSERVED_NOT_ATTESTED');
 assert.equal(result.interaction.scenarios.length,contract.scenarios.length);
 assert.equal(stats().closed,1);
 assert.equal(result.manifest,null);
});
test('in-process failed assertion blocks task assurance',async()=>{
 const {adapter}=fakeAdapter({fail:true});
 const result=await executeAssurance({contract,tasks,adapterFactory:async()=>adapter});
 assert.equal(result.assurance.gate.status,'BLOCK');
 assert.ok(result.interaction.findings.some(f=>f.rule_id==='FLOW-ASSERTION_FAILED'));
});
test('adapter initialization errors fail closed rather than generating a passing report',async()=>{
 await assert.rejects(executeAssurance({contract,tasks,adapterFactory:async()=>{throw Error('Playwright unavailable')}}),/Playwright unavailable/);
});
test('reject invalid task definitions before launching a browser',async()=>{
 let launched=false;
 await assert.rejects(executeAssurance({contract,tasks:{...tasks,tasks:[]},adapterFactory:async()=>{launched=true}}),/Invalid tasks/);
 assert.equal(launched,false);
});
test('supplied reports never inherit in-process provenance',()=>{
 const supplied={mode:'interaction',contract_id:contract.id,contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map(a=>({check:a.check,status:'PASS'}))}))})),findings:[],artifacts:[],counts:{scenarios:contract.scenarios.length,passed:contract.scenarios.length,failed:0}};
 assert.equal(assuranceReport({contract,tasks,interaction:supplied}).execution.status,'REPORT_SUPPLIED_UNAUTHENTICATED');
});

test('assure CLI refuses --execute together with an externally supplied report',async()=>{
 const {spawnSync}=await import('node:child_process');
 const p=spawnSync(process.execPath,['src/cli.js','assure','--tasks','examples/frameworks/tasks.json','--contract','examples/frameworks/interaction-contract.json','--execute','--report','arbitrary.json'],{encoding:'utf8'});
 assert.equal(p.status,2);
 assert.match(p.stderr,/cannot be combined/);
});
test('assure CLI fails closed when Playwright is missing',async()=>{
 const {spawnSync}=await import('node:child_process');
 const p=spawnSync(process.execPath,['src/cli.js','assure','--tasks','examples/frameworks/tasks.json','--contract','examples/frameworks/interaction-contract.json','--execute'],{encoding:'utf8'});
 assert.notEqual(p.status,0);
 assert.doesNotMatch(p.stdout,/CONTRACT_PASS/);
});
