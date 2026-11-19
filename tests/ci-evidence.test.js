import test from 'node:test';
import assert from 'node:assert/strict';
import {ciReceipt} from '../src/ci-evidence.js';
const base=()=>({contract_id:'contract',manifest_id:'tasks',contract_sha256:'a'.repeat(64),gate:{status:'CONTRACT_PASS',blocks_ci:false},execution:{status:'IN_PROCESS_OBSERVED_NOT_ATTESTED'},counts:{verified_contract:1,failed:0,not_verified:0},tasks:[{id:'task',status:'VERIFIED_CONTRACT'}],private_url:'https://secret.example/?token=secret'});
test('receipt summarizes without copying sensitive report fields',()=>{
 const receipt=ciReceipt(base(),{framework:'react',runId:'123',revision:'f'.repeat(40)});
 assert.equal(receipt.gate,'CONTRACT_PASS');assert.equal(receipt.attestation,'NOT_ATTESTED');
 assert.equal(receipt.assurance_sha256.length,64);assert.ok(!JSON.stringify(receipt).includes('secret'));
});
test('report change alters digest',()=>{const a=base(),b=base();b.private_url='different';assert.notEqual(ciReceipt(a,{framework:'vue'}).assurance_sha256,ciReceipt(b,{framework:'vue'}).assurance_sha256);});
test('supplied reports cannot claim CI pass',()=>{const a=base();a.execution.status='REPORT_SUPPLIED_UNAUTHENTICATED';assert.throws(()=>ciReceipt(a,{framework:'react'}),/in-process/);});
test('missing tasks cannot claim CI pass',()=>{const a=base();a.counts.verified_contract=0;a.counts.not_verified=1;assert.throws(()=>ciReceipt(a,{framework:'react'}),/in-process/);});
test('contradictory gate rejected',()=>{const a=base();a.gate.blocks_ci=true;assert.throws(()=>ciReceipt(a,{framework:'react'}),/Contradictory/);});
test('reject injected CI metadata',()=>{assert.throws(()=>ciReceipt(base(),{framework:'react',runId:'123\nsecret'}),/run ID/);assert.throws(()=>ciReceipt(base(),{framework:'vue',revision:'not-a-sha'}),/commit SHA/);});
test('task counts and identifiers are validated',()=>{const a=base();a.counts.failed=1;assert.throws(()=>ciReceipt(a,{framework:'react'}),/count mismatch/);a.counts.failed=0;a.manifest_id='../secret';assert.throws(()=>ciReceipt(a,{framework:'react'}),/task ID/);});
