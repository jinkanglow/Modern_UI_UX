import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCiReceiptDirectory,writeCiJsonAtomic} from '../src/ci-run-files.js';
import {verifyCiBundleDirectory} from '../src/ci-bundle.js';
function temporary(fn){const d=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-run-'));try{fn(d);}finally{fs.rmSync(d,{recursive:true,force:true});}}
test('new CI run removes stale framework receipts and previous verification',()=>temporary(d=>{
 for(const name of ['react.json','vue.json','bundle-verification.json'])fs.writeFileSync(path.join(d,name),'old');
 fs.writeFileSync(path.join(d,'keep.txt'),'keep');prepareCiReceiptDirectory(d);
 for(const name of ['react.json','vue.json','bundle-verification.json'])assert.equal(fs.existsSync(path.join(d,name)),false);
 assert.equal(fs.readFileSync(path.join(d,'keep.txt'),'utf8'),'keep');
}));
test('atomic receipt write produces valid JSON without temp leftovers',()=>temporary(d=>{
 writeCiJsonAtomic(d,'react.json',{gate:'BLOCK'});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d,'react.json'),'utf8')),{gate:'BLOCK'});
 assert.deepEqual(fs.readdirSync(d),['react.json']);
}));
test('receipt writer refuses arbitrary filenames',()=>temporary(d=>assert.throws(()=>writeCiJsonAtomic(d,'../outside.json',{}),/Unsupported/)));
test('receipt writer refuses symlink output directory',()=>temporary(d=>{
 const real=path.join(d,'real');const link=path.join(d,'link');fs.mkdirSync(real);fs.symlinkSync(real,link);
 assert.throws(()=>prepareCiReceiptDirectory(link),/real directory/);
 assert.throws(()=>writeCiJsonAtomic(link,'react.json',{}),/real directory/);
}));
test('bundle verifier rejects symlinked receipts',()=>temporary(d=>{
 fs.writeFileSync(path.join(d,'other.json'),'{}');fs.symlinkSync('other.json',path.join(d,'react.json'));
 const result=verifyCiBundleDirectory(d);assert.equal(result.status,'BLOCK');assert.ok(result.errors.includes('react:MISSING_RECEIPT'));
}));
test('partial fresh run fails closed even with leftover unrelated files',()=>temporary(d=>{
 prepareCiReceiptDirectory(d);writeCiJsonAtomic(d,'react.json',{gate:'CONTRACT_PASS'});
 assert.equal(verifyCiBundleDirectory(d).status,'BLOCK');
}));
