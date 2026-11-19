import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readContract,contractFingerprint} from '../src/interaction.js';
import {validateTaskManifest,taskCoverage} from '../src/tasks.js';
const contract=readContract('examples/interaction/network-contract.json');
const manifest=JSON.parse(fs.readFileSync('examples/interaction/tasks-v22.json','utf8'));
function report(){return {contract_id:contract.id,contract_sha256:contractFingerprint(contract),scenarios:contract.scenarios.map(s=>({id:s.id,status:'PASS',steps:s.steps.map((step,i)=>({index:i+1,action:step.action,status:'PASS',checks:step.expect.map(a=>({check:a.check,status:'PASS'}))}))}))};}
test('v2.2 binds task assertions to exact contract assertions',()=>{assert.deepEqual(validateTaskManifest(manifest,contract),[]);const result=taskCoverage(manifest,contract,report());assert.equal(result.counts.verified_contract,2);assert.equal(result.tasks[0].assertion_evidence.length,2);});
test('v2.2 cannot verify a report without matching contract fingerprint',()=>{const r=report();delete r.contract_sha256;assert.throws(()=>taskCoverage(manifest,contract,r),/fingerprint/);r.contract_sha256='0'.repeat(64);assert.throws(()=>taskCoverage(manifest,contract,r),/fingerprint/);});
test('v2.2 rejects assertion whose target or expectation differs from contract',()=>{const m=structuredClone(manifest);m.tasks[0].required_assertions[0].equals='Fake success';assert.match(validateTaskManifest(m,contract).join(' '),/does not match/);});
test('v2.2 rejects assertion not present in the declared scenario',()=>{const m=structuredClone(manifest);m.tasks[0].required_assertions[0].assertion=99;assert.match(validateTaskManifest(m,contract).join(' '),/does not refer/);});
test('v2.2 does not infer verified tasks from partial scenario reports',()=>{const r=report();r.scenarios=r.scenarios.slice(0,1);const result=taskCoverage(manifest,contract,r);assert.equal(result.counts.verified_contract,1);assert.equal(result.counts.not_verified,1);});
test('v2.2 rejects duplicate assertion bindings',()=>{const m=structuredClone(manifest);m.tasks[0].required_assertions.push(structuredClone(m.tasks[0].required_assertions[0]));assert.match(validateTaskManifest(m,contract).join(' '),/duplicates/);});
