import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {audit} from '../src/audit.js';
import {rules} from '../src/rules.js';
import {loadRuleContracts,validateRuleContract,selectRuleContracts,contractCatalog} from '../src/rule-contracts.js';
const contracts=loadRuleContracts();
test('every shipped static rule has a unique, validated machine-readable contract',()=>{
 assert.equal(contracts.length,rules.length);
 assert.deepEqual(new Set(contracts.map(c=>c.id)),new Set(rules.map(r=>r.id)));
 assert.equal(contractCatalog().counts.cases,contracts.length*3);
});
test('task selection is explicit, deterministic and does not imply execution',()=>{
 const a=selectRuleContracts({tasks:['form']});
 assert.equal(a.status,'SELECTED_NOT_EXECUTED');
 assert.ok(a.selected_rules.some(r=>r.id==='HTML-004'));
 assert.ok(a.selected_rules.every(r=>r.tasks.includes('form')));
 assert.deepEqual(selectRuleContracts({ruleIds:['CSS-002']}).selected_rules.map(r=>r.id),['CSS-002']);
 assert.throws(()=>selectRuleContracts({tasks:['checkout']}),/Unknown task/);
 assert.throws(()=>selectRuleContracts(),/at least one/);
});
test('contract schema rejects missing cases and false runtime claims',()=>{
 const good=structuredClone(contracts[0]);good.cases.pop();assert.throws(()=>validateRuleContract(good),/required/);
 const bad=structuredClone(contracts[0]);bad.decision.runtime_claim_allowed=true;assert.throws(()=>validateRuleContract(bad),/ungrounded/);
});
for(const contract of contracts){
 test(`${contract.id}: trigger / counterexample / boundary execute against actual audit`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-contract-'));
  try{
   for(const c of contract.cases){
    const f=path.join(dir,`case.${c.extension}`);
    fs.writeFileSync(f,c.source);
    const result=audit(f);
    const actual=result.findings.some(x=>x.rule_id===contract.id);
    assert.equal(actual,c.expect_detected,`${contract.id}/${c.name}: expected ${c.expect_detected}, actual ${actual}; ${JSON.stringify(result.findings)}`);
    fs.unlinkSync(f);
   }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
}
