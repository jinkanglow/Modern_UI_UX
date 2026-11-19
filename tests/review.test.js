import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {addSnapshot} from '../src/dataset.js';
import {evaluate} from '../src/evaluate.js';
import {submitReview,compareReviews,adjudicate,exportReviewed} from '../src/review.js';
const repo='https://github.com/example/sample',revision='a'.repeat(40);
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-review-'));try{const src=path.join(dir,'a.html');fs.writeFileSync(src,'<html>\n<img src="a.png">\n</html>\n');const dataset=path.join(dir,'dataset');addSnapshot({dataset,source:src,id:'case1',technology:'html',repository:repo,revision,sourcePath:'a.html'});const write=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value));return file;};return fn({dir,dataset,write});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const label=(line=2)=>({rule_id:'HTML-001',line,status:'FAIL'});
function review(d,who,annotations){return submitReview({dataset:d.dataset,id:'case1',reviewer:who,guidelineVersion:'v1',file:d.write(`${who}.json`,{reviewed_rule_ids:['HTML-001'],annotations})});}
test('independent immutable reviews, disagreement and adjudication export',()=>fixture(d=>{
 review(d,'alice',[label()]);review(d,'bob',[]);
 assert.throws(()=>review(d,'alice',[label()]),/EEXIST/);
 const c=compareReviews({dataset:d.dataset,id:'case1',reviewers:['alice','bob']});assert.equal(c.disagreement_count,1);
 assert.throws(()=>adjudicate({dataset:d.dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'carol',file:d.write('bad.json',{accepted_disagreements:[],rejected_disagreements:[],rationale:'Investigated source code'})}),/Every disagreement/);
 const decision=d.write('decision.json',{accepted_disagreements:c.disagreements,rejected_disagreements:[],rationale:'The image has no alternate text.'});
 adjudicate({dataset:d.dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'carol',file:decision});
 const result=exportReviewed({dataset:d.dataset,out:path.join(d.dataset,'curated.json')});assert.equal(result.exported,1);
 const exported=JSON.parse(fs.readFileSync(result.manifest));assert.deepEqual(exported.cases[0].annotations,[label()]);
 assert.equal(exported.cases[0].review.method,'independent-double');
}));
test('reject invalid labels, incomplete coverage and same reviewer',()=>fixture(d=>{
 assert.throws(()=>review(d,'alice',[label(999)]),/Invalid annotation/);
 review(d,'alice',[]);review(d,'bob',[]);
 assert.throws(()=>compareReviews({dataset:d.dataset,id:'case1',reviewers:['alice','alice']}),/distinct/);
 assert.throws(()=>adjudicate({dataset:d.dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'alice',file:d.write('x.json',{})}),/distinct/);
}));
test('snapshot tampering invalidates submitted reviews',()=>fixture(d=>{
 review(d,'alice',[]);review(d,'bob',[]);fs.appendFileSync(path.join(d.dataset,'snapshots','case1.html'),'changed');
 assert.throws(()=>compareReviews({dataset:d.dataset,id:'case1',reviewers:['alice','bob']}),/integrity mismatch/);
}));
test('reviewer coverage must match',()=>fixture(d=>{
 review(d,'alice',[]);submitReview({dataset:d.dataset,id:'case1',reviewer:'bob',guidelineVersion:'v1',file:d.write('bob.json',{reviewed_rule_ids:['HTML-001','HTML-004'],annotations:[]})});
 assert.throws(()=>compareReviews({dataset:d.dataset,id:'case1',reviewers:['alice','bob']}),/coverage differs/);
}));
test('CLI review and compare integration',()=>fixture(d=>{
 const cli=path.resolve('src/cli.js');
 for(const who of ['alice','bob']){const f=d.write(`${who}.json`,{reviewed_rule_ids:['HTML-001'],annotations:[]});const r=spawnSync(process.execPath,[cli,'dataset','review',d.dataset,'case1','--reviewer',who,'--guideline','v1','--file',f],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const r=spawnSync(process.execPath,[cli,'dataset','compare',d.dataset,'case1','--reviewers','alice,bob'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).disagreement_count,0);
}));
test('exported evaluation counts only reviewed rule coverage',()=>fixture(d=>{
 review(d,'alice',[label()]);review(d,'bob',[label()]);
 const decision=d.write('decision.json',{accepted_disagreements:[],rejected_disagreements:[],rationale:'Both reviewers independently agreed.'});
 adjudicate({dataset:d.dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'carol',file:decision});
 const result=exportReviewed({dataset:d.dataset,out:path.join(d.dataset,'curated.json')});
 const report=evaluate(result.manifest);
 assert.equal(report.counts.tp,1);assert.equal(report.counts.fp,0);assert.equal(report.counts.fn,0);
 assert.deepEqual(report.cases[0].reviewed_rule_ids,['HTML-001']);
}));
