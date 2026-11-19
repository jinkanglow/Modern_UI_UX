import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {contractCoverage,observedCoverage} from '../src/coverage.js';
import {readContract} from '../src/interaction.js';
const contract=readContract('examples/interaction/network-contract.json');

test('coverage counts declared scenarios, steps, assertions and failure modes',()=>{
 const c=contractCoverage(contract);
 assert.equal(c.counts.scenarios,3);
 assert.equal(c.counts.steps,3);
 assert.equal(c.counts.assertions,8);
 assert.equal(c.actions.double_click,1);
 assert.equal(c.checks.request_count,2);
 assert.equal(c.network_failure_modes.http_error,1);
 assert.equal(c.network_failure_modes.network_abort,1);
 assert.equal(c.network_failure_modes.delayed_response,1);
 assert.ok(c.limitations.some(x=>x.includes('no browser')));
});
test('coverage reports missing categories as not declared, not failures',()=>{
 const c=contractCoverage(contract);
 assert.ok(c.not_declared.actions.includes('fill'));
 assert.equal(c.mode,'contract-coverage');
 assert.equal('status' in c,false);
});
test('observed coverage counts early exit as unexecuted',()=>{
 const c={...contract,scenarios:[{id:'one',steps:[{action:'assert_only',expect:[{check:'visible',selector:'#a'}]},{action:'assert_only',expect:[{check:'visible',selector:'#b'}]}]}],schema_version:'1.0'};
 const report={contract_id:c.id,scenarios:[{id:'one',status:'FAIL',steps:[{index:1,action:'assert_only',status:'FAIL'}]}]};
 const o=observedCoverage(c,report);
 assert.equal(o.observed.steps_failed,1);
 assert.equal(o.observed.steps_not_executed,1);
 assert.equal(o.observed.scenarios_failed,1);
});
test('observed coverage rejects mismatched contract and duplicate scenarios',()=>{
 assert.throws(()=>observedCoverage(contract,{contract_id:'wrong',scenarios:[]}),/does not match/);
 assert.throws(()=>observedCoverage(contract,{contract_id:contract.id,scenarios:[{id:'unknown',status:'FAIL',steps:[]}]}),/Unexpected/);
});
test('passing scenario must have all steps executed',()=>{
 assert.throws(()=>observedCoverage(contract,{contract_id:contract.id,scenarios:[{id:contract.scenarios[0].id,status:'PASS',steps:[]}]}),/Inconsistent/);
});
test('coverage CLI emits valid JSON and supports --out',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-coverage-'));
 try{
  const out=path.join(tmp,'coverage.json');
  execFileSync(process.execPath,['src/cli.js','coverage','--contract','examples/interaction/network-contract.json','--out',out]);
  const result=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(result.counts.scenarios,3);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
