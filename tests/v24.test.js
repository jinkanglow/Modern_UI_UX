import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateTaskManifest,taskCoverage} from '../src/tasks.js';
import {contractFingerprint} from '../src/interaction.js';
const contract=JSON.parse(fs.readFileSync('examples/frameworks/interaction-contract.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
test('cross-framework task manifest binds every assertion to an actual contract assertion',()=>{
 assert.deepEqual(validateTaskManifest(manifest,contract),[]);
 assert.equal(manifest.tasks.length,4);
});
test('task declaration is not counted as verified execution',()=>{
 const result=taskCoverage(manifest,contract);
 assert.equal(result.counts.not_verified,4);
 assert.equal(result.counts.verified_contract,0);
});
test('complete, fingerprint-matched browser reports can verify the four task contracts',()=>{
 const report={contract_id:contract.id,contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map(a=>({check:a.check,status:'PASS'}))}))}))};
 const result=taskCoverage(manifest,contract,report);
 assert.equal(result.counts.verified_contract,4);
});
test('missing scenarios remain unverified rather than silently passing',()=>{
 const result=taskCoverage(manifest,contract,{contract_id:contract.id,contract_sha256:contractFingerprint(contract),scenarios:[]});
 assert.equal(result.counts.not_verified,4);
});
test('tasks CLI rejects --execute with a supplied report',()=>{
 const p=spawnSync(process.execPath,['src/cli.js','tasks','--tasks','examples/frameworks/tasks.json','--contract','examples/frameworks/interaction-contract.json','--execute','--report','example.json'],{encoding:'utf8'});
 assert.equal(p.status,2);
 assert.match(p.stderr,/cannot be combined/);
});
