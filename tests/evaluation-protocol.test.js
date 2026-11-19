import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluate} from '../src/evaluate.js';
import {compareEvaluation,sha256} from '../src/evaluation-protocol.js';
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/evaluation-v12/manifest.json');
function tempCase(change){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-protocol-'));const source=path.join(dir,'sample.html');fs.writeFileSync(source,'<html lang="en"><head><title>T</title><meta name="viewport" content="width=device-width"></head><body><img src="a"></body></html>');const item={id:'case-1',file:'sample.html',technology:'html',origin:'synthetic',sha256:sha256(source),review:{method:'single',reviewers:['r1'],guideline_version:'v1'},annotations:[{rule_id:'HTML-001',line:1,status:'FAIL'}]};change(item);const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({schema_version:'1.2',cases:[item]}));return {dir,manifest};}
function checkChange(change,pattern){const {dir,manifest}=tempCase(change);try{assert.throws(()=>evaluate(manifest),pattern);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('frozen synthetic v1.2 dataset evaluates and groups results',()=>{const r=evaluate(fixture);assert.equal(r.schema_version,'1.2');assert.equal(r.counts.tp,3);assert.equal(r.strata['synthetic/html'].cases,3);assert.equal(r.cases[0].review_method,'single');});
test('frozen content hash mismatch fails closed',()=>checkChange(x=>x.sha256='0'.repeat(64),/Content hash mismatch/));
test('duplicate stable case ids fail closed',()=>{const {dir,manifest}=tempCase(()=>{});try{const m=JSON.parse(fs.readFileSync(manifest));m.cases.push({...m.cases[0]});fs.writeFileSync(manifest,JSON.stringify(m));assert.throws(()=>evaluate(manifest),/unique stable id/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('real-project provenance requires pinned revision and source path',()=>checkChange(x=>x.origin='real-project',/needs repository URL/));
test('double review requires two distinct reviewer ids',()=>checkChange(x=>x.review={method:'independent-double',reviewers:['r1'],guideline_version:'v1'},/requires reviewer IDs/));
test('unrecognized technology rejected',()=>checkChange(x=>x.technology='magic',/Invalid technology/));
test('baseline comparison detects added cases',()=>{const r=evaluate(fixture);const b=structuredClone(r);b.cases.pop();const diff=compareEvaluation(r,b);assert.equal(diff.comparable,false);assert.deepEqual(diff.added,['synthetic-03']);});
test('identical baseline is comparable',()=>{const r=evaluate(fixture);const diff=compareEvaluation(r,structuredClone(r));assert.equal(diff.comparable,true);assert.equal(diff.delta.fp,0);});
test('changed content hash makes baseline incomparable',()=>{const r=evaluate(fixture);const b=structuredClone(r);b.cases[0].sha256='a'.repeat(64);assert.equal(compareEvaluation(r,b).comparable,false);});
test('changed ground-truth annotations invalidate baseline comparability',()=>{const r=evaluate(fixture);const b=structuredClone(r);b.cases[0].annotation_sha256='f'.repeat(64);assert.equal(compareEvaluation(r,b).comparable,false);});
