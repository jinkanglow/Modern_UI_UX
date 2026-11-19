import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {addSnapshot} from '../src/dataset.js';
import {submitReview,adjudicate} from '../src/review.js';
import {auditReviewDataset} from '../src/review-audit.js';
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-audit-'));try{const source=path.join(dir,'source.html');fs.writeFileSync(source,'<img src="x">\n');const dataset=path.join(dir,'dataset');addSnapshot({dataset,source,id:'case1',technology:'html',repository:'https://github.com/example/test',revision:'a'.repeat(40),sourcePath:'source.html'});const input=(name,value)=>{const p=path.join(dir,name);fs.writeFileSync(p,JSON.stringify(value));return p;};return fn({dataset,input});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function reviewed(d){for(const reviewer of ['alice','bob'])submitReview({dataset:d.dataset,id:'case1',reviewer,guidelineVersion:'v1',file:d.input(reviewer+'.json',{reviewed_rule_ids:['HTML-001'],annotations:[]})});}
function decided(d){adjudicate({dataset:d.dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'carol',file:d.input('decision.json',{accepted_disagreements:[],rejected_disagreements:[],rationale:'Both reviewers agreed on no findings.'})});}
test('incomplete review is blocked',()=>fixture(d=>{const r=auditReviewDataset(d.dataset);assert.equal(r.status,'BLOCK');assert.deepEqual(r.cases[0].issues,['REQUIRES_EXACTLY_TWO_REVIEWS','MISSING_ADJUDICATION']);}));
test('two independent reviews still require adjudication',()=>fixture(d=>{reviewed(d);assert.equal(auditReviewDataset(d.dataset).status,'BLOCK');}));
test('completed adjudication passes procedural gate',()=>fixture(d=>{reviewed(d);decided(d);const r=auditReviewDataset(d.dataset);assert.equal(r.status,'READY_FOR_EXPORT');assert.equal(r.counts.ready,1);}));
test('tampered adjudicator is rejected',()=>fixture(d=>{reviewed(d);decided(d);const p=path.join(d.dataset,'adjudications','case1.json');const a=JSON.parse(fs.readFileSync(p));a.adjudicator='alice';fs.writeFileSync(p,JSON.stringify(a));assert.ok(auditReviewDataset(d.dataset).cases[0].issues.includes('INVALID_OR_STALE_ADJUDICATION'));}));
test('tampered snapshot prevents readiness',()=>fixture(d=>{reviewed(d);decided(d);fs.appendFileSync(path.join(d.dataset,'snapshots','case1.html'),'x');assert.equal(auditReviewDataset(d.dataset).status,'BLOCK');}));
test('CLI returns nonzero when review is incomplete',()=>fixture(d=>{const r=spawnSync(process.execPath,['src/cli.js','dataset','review-audit',d.dataset],{encoding:'utf8'});assert.equal(r.status,1,r.stderr);assert.equal(JSON.parse(r.stdout).status,'BLOCK');}));
