import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {assuranceReport} from '../src/assurance.js';
import {contractFingerprint} from '../src/interaction.js';
const contract=JSON.parse(fs.readFileSync('examples/frameworks/interaction-contract.json','utf8'));
const tasks=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
function passingReport(){return {mode:'interaction',contract_id:contract.id,contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map(a=>({check:a.check,status:'PASS'}))}))})),findings:[],artifacts:[],counts:{scenarios:contract.scenarios.length,passed:contract.scenarios.length,failed:0}};}
test('no browser report is incomplete and blocks CI',()=>{const r=assuranceReport({contract,tasks});assert.equal(r.gate.status,'INCOMPLETE');assert.equal(r.execution.status,'NOT_EXECUTED');});
test('matching supplied report passes declared contracts but remains unauthenticated',()=>{const r=assuranceReport({contract,tasks,interaction:passingReport()});assert.equal(r.gate.status,'CONTRACT_PASS');assert.equal(r.counts.verified_contract,4);assert.equal(r.execution.status,'REPORT_SUPPLIED_UNAUTHENTICATED');});
test('mismatched fingerprint rejected',()=>{const r=passingReport();r.contract_sha256='0'.repeat(64);assert.throws(()=>assuranceReport({contract,tasks,interaction:r}),/fingerprint/);});
test('missing scenarios rejected even with passing counts',()=>{const r=passingReport();r.scenarios.pop();assert.throws(()=>assuranceReport({contract,tasks,interaction:r}),/Incomplete scenario coverage/);});
test('failed assertion blocks CI',()=>{const r=passingReport();r.scenarios[0].status='FAIL';r.scenarios[0].steps[0].status='FAIL';r.scenarios[0].steps[0].checks[0].status='FAIL';r.counts.failed=1;r.counts.passed--;assert.equal(assuranceReport({contract,tasks,interaction:r}).gate.status,'BLOCK');});
test('intact and tampered evidence manifests are distinguished',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-assure-'));try{const file=path.join(dir,'shot.png');fs.writeFileSync(file,'image-data');const manifest={schema_version:'1.8',entries:[{filename:'shot.png',bytes:10,sha256:crypto.createHash('sha256').update('image-data').digest('hex')}]};assert.equal(assuranceReport({contract,tasks,interaction:passingReport(),manifest,evidenceDir:dir}).evidence_integrity.status,'INTACT');fs.writeFileSync(file,'changed');assert.equal(assuranceReport({contract,tasks,interaction:passingReport(),manifest,evidenceDir:dir}).gate.status,'BLOCK');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('summary excludes URL, input values and raw findings',()=>{const r=passingReport();r.target='https://example.test/secret';r.findings=[{evidence:'password=secret'}];const text=JSON.stringify(assuranceReport({contract,tasks,interaction:r}));assert.ok(!text.includes('password=secret'));assert.ok(!text.includes('example.test/secret'));});
