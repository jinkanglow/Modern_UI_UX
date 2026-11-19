import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluate} from '../src/evaluate.js';
const dataset=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/evaluation/manifest.json');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-eval-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function writeCase(dir,annotations){fs.writeFileSync(path.join(dir,'page.html'),'<html lang="en"><head><title>T</title><meta name="viewport" content="width=device-width"></head><body><img src="a"></body></html>');const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({schema_version:'1.1',cases:[{file:'page.html',annotations}]}));return manifest;}
test('line-annotated HTML dataset has three confirmed matches and one candidate',()=>{const r=evaluate(dataset);assert.deepEqual(r.counts,{tp:3,fp:0,fn:0,uncertain_matched:1,unexpected_unverified:0});assert.equal(r.precision,1);assert.equal(r.recall,1);});
test('unannotated confirmed finding is a false positive',()=>fixture(dir=>{const r=evaluate(writeCase(dir,[]));assert.equal(r.counts.fp,1);assert.equal(r.precision,0);assert.equal(r.recall,null);}));
test('expected missing rule is a false negative',()=>fixture(dir=>{const r=evaluate(writeCase(dir,[{rule_id:'HTML-013',line:1,status:'FAIL'}]));assert.equal(r.counts.fn,1);assert.equal(r.counts.fp,1);}));
test('invalid rule ID is rejected',()=>fixture(dir=>{assert.throws(()=>evaluate(writeCase(dir,[{rule_id:'NO-SUCH-RULE',line:1,status:'FAIL'}])),/Invalid annotation/);}));
test('duplicate annotations are rejected',()=>fixture(dir=>{const a={rule_id:'HTML-001',line:1,status:'FAIL'};assert.throws(()=>evaluate(writeCase(dir,[a,a])),/Duplicate annotation/);}));
test('path traversal is rejected',()=>fixture(dir=>{fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({schema_version:'1.1',cases:[{file:'../escape.html',annotations:[]}]}));assert.throws(()=>evaluate(path.join(dir,'manifest.json')),/escapes dataset/);}));
test('out-of-bounds line is rejected',()=>fixture(dir=>{assert.throws(()=>evaluate(writeCase(dir,[{rule_id:'HTML-001',line:100,status:'FAIL'}])),/beyond end/);}));
test('unexpected candidate is reported separately',()=>fixture(dir=>{fs.writeFileSync(path.join(dir,'page.html'),'<html lang="en"><head><title>T</title><meta name="viewport" content="width=device-width"></head><body><div onclick="go()">Click</div></body></html>');const manifest=writeCase(dir,[]);fs.writeFileSync(path.join(dir,'page.html'),'<html lang="en"><head><title>T</title><meta name="viewport" content="width=device-width"></head><body><div onclick="go()">Click</div></body></html>');const r=evaluate(manifest);assert.equal(r.counts.unexpected_unverified,1);assert.equal(r.counts.fp,0);}));
