import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {evaluate} from '../src/evaluate.js';
import {evaluationTriage} from '../src/evaluation-triage.js';
const fixture='tests/fixtures/evaluation-v12/manifest.json';
const original=evaluate(fixture);
const copy=()=>structuredClone(original);
const finding={rule_id:'HTML-001',line:4,status:'FAIL'};
function withIssue(kind){const r=copy();const c=r.cases[0];const field=kind==='fp'?'false_positives':kind==='fn'?'false_negatives':'unexpected_unverified';c[field].push({...finding,status:kind==='unexpected_unverified'?'UNVERIFIED':'FAIL'});c.counts[kind]++;r.counts[kind]++;return r;}
test('zero errors is explicitly limited to observed cases',()=>{const t=evaluationTriage(original);assert.equal(t.status,'NO_OBSERVED_ERRORS');assert.equal(t.counts.total,0);assert.match(t.limitations[0],/untested/);});
test('sorts actionable errors by kind and rule',()=>{const r=copy();for(const [kind,rule] of [['fp','HTML-004'],['fn','HTML-001'],['unexpected_unverified','HTML-014']]){const c=r.cases[0];const field=kind==='fp'?'false_positives':kind==='fn'?'false_negatives':'unexpected_unverified';c[field].push({rule_id:rule,line:4,status:kind==='unexpected_unverified'?'UNVERIFIED':'FAIL'});c.counts[kind]++;r.counts[kind]++;}const t=evaluationTriage(r);assert.deepEqual(t.issues.map(x=>x.kind),['FALSE_NEGATIVE','FALSE_POSITIVE','UNEXPECTED_UNVERIFIED']);assert.equal(t.by_rule['HTML-001'].false_negatives,1);});
test('rejects inconsistent aggregate counts',()=>{const r=copy();r.counts.fp=1;assert.throws(()=>evaluationTriage(r),/totals/);});
test('rejects missing issue details and duplicate IDs',()=>{const r=copy();r.cases[0].counts.fp=1;assert.throws(()=>evaluationTriage(r),/inconsistent/);const d=copy();d.cases[1].id=d.cases[0].id;assert.throws(()=>evaluationTriage(d),/unique/);});
test('detects new regression against identical frozen baseline',()=>{const t=evaluationTriage(withIssue('fn'),{baseline:original});assert.equal(t.status,'REGRESSION');assert.equal(t.regression.new_errors.length,1);assert.equal(t.regression.resolved_errors.length,0);});
test('detects resolved errors and does not classify as regression',()=>{const t=evaluationTriage(original,{baseline:withIssue('fp')});assert.equal(t.status,'NO_OBSERVED_ERRORS');assert.equal(t.regression.resolved_errors.length,1);});
test('rejects baseline when frozen annotation or rule coverage changes',()=>{const r=copy();r.cases[0].annotation_sha256='f'.repeat(64);assert.throws(()=>evaluationTriage(r,{baseline:original}),/identical/);});
test('CLI emits a valid triage report',()=>{const p=spawnSync(process.execPath,['src/cli.js','evaluation-triage',fixture],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).status,'NO_OBSERVED_ERRORS');});
