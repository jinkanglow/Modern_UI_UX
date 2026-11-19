import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {addSnapshot} from '../src/dataset.js';
import {submitReview,adjudicate,exportReviewed} from '../src/review.js';

function withDataset(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-export-gate-'));
 try{
  const dataset=path.join(root,'dataset'),source=path.join(root,'source.html');
  fs.writeFileSync(source,'<main>Example</main>\n');
  addSnapshot({dataset,source,id:'case1',technology:'html',repository:'https://github.com/example/repo',revision:'a'.repeat(40),sourcePath:'source.html'});
  const input=(name,data)=>{const file=path.join(root,name);fs.writeFileSync(file,JSON.stringify(data));return file;};
  const out=path.join(dataset,'curated.json');
  const review=()=>{for(const reviewer of ['alice','bob'])submitReview({dataset,id:'case1',reviewer,guidelineVersion:'v1',file:input(reviewer+'.json',{reviewed_rule_ids:['HTML-001'],annotations:[]})});};
  const decide=()=>adjudicate({dataset,id:'case1',reviewers:['alice','bob'],adjudicator:'carol',file:input('decision.json',{accepted_disagreements:[],rejected_disagreements:[],rationale:'Both reviewers found no issues.'})});
  return fn({dataset,out,review,decide});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('rejects unreviewed export without creating a file',()=>withDataset(d=>{assert.throws(()=>exportReviewed(d),/Review audit BLOCK/);assert.equal(fs.existsSync(d.out),false);}));
test('rejects two reviews without adjudication',()=>withDataset(d=>{d.review();assert.throws(()=>exportReviewed(d),/MISSING_ADJUDICATION/);}));
test('exports complete dataset with no pending cases',()=>withDataset(d=>{d.review();d.decide();const result=exportReviewed(d);assert.equal(result.exported,1);assert.equal(result.excluded_pending,0);assert.equal(JSON.parse(fs.readFileSync(d.out)).cases.length,1);}));
test('rejects tampered adjudication and preserves previous export',()=>withDataset(d=>{d.review();d.decide();exportReviewed(d);const before=fs.readFileSync(d.out);const file=path.join(d.dataset,'adjudications','case1.json');const a=JSON.parse(fs.readFileSync(file));a.adjudicator='alice';fs.writeFileSync(file,JSON.stringify(a));assert.throws(()=>exportReviewed(d),/Review audit BLOCK/);assert.deepEqual(fs.readFileSync(d.out),before);}));
test('rejects corrupted source and preserves previous export',()=>withDataset(d=>{d.review();d.decide();exportReviewed(d);const before=fs.readFileSync(d.out);fs.appendFileSync(path.join(d.dataset,'snapshots','case1.html'),'altered');assert.throws(()=>exportReviewed(d),/Review audit BLOCK/);assert.deepEqual(fs.readFileSync(d.out),before);}));
test('CLI fails closed on incomplete dataset',()=>withDataset(d=>{const run=spawnSync(process.execPath,['src/cli.js','dataset','export',d.dataset,'--out',d.out],{encoding:'utf8'});assert.equal(run.status,2);assert.match(run.stderr,/Review audit BLOCK/);assert.equal(fs.existsSync(d.out),false);}));
