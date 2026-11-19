import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyProvenance} from '../src/provenance-check.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-provenance-')),repo=path.join(base,'repo'),data=path.join(base,'dataset');fs.mkdirSync(repo);fs.mkdirSync(data);
 const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Test');
 fs.writeFileSync(path.join(repo,'sample.html'),'<button>Save</button>');git('add','.');git('commit','-qm','sample');const revision=git('rev-parse','HEAD');
 fs.mkdirSync(path.join(data,'snapshots'));fs.writeFileSync(path.join(data,'snapshots','case.html'),'<button>Save</button>');
 const c={id:'case',file:'snapshots/case.html',sha256:hash('<button>Save</button>'),provenance:{repository:'https://example.invalid/repo',revision,source_path:'sample.html'}};
 const write=()=>fs.writeFileSync(path.join(data,'manifest.json'),JSON.stringify({schema_version:'1.3-draft',cases:[c]}));write();
 return {base,repo,data,c,write};
}
function withFixture(fn){const f=fixture();try{fn(f);}finally{fs.rmSync(f.base,{recursive:true,force:true});}}
test('matching pinned Git object verifies local snapshot',()=>withFixture(f=>{const r=verifyProvenance(f.data,f.repo);assert.equal(r.status,'LOCAL_BLOBS_MATCH');assert.equal(r.counts.verified,1);}));
test('working tree edits do not change pinned commit result',()=>withFixture(f=>{fs.writeFileSync(path.join(f.repo,'sample.html'),'changed');assert.equal(verifyProvenance(f.data,f.repo).counts.verified,1);}));
test('tampered snapshot is rejected',()=>withFixture(f=>{fs.writeFileSync(path.join(f.data,'snapshots','case.html'),'changed');assert.equal(verifyProvenance(f.data,f.repo).cases[0].reason,'SNAPSHOT_HASH_MISMATCH');}));
test('wrong pinned file content is a mismatch',()=>withFixture(f=>{f.c.sha256=hash('other');fs.writeFileSync(path.join(f.data,'snapshots','case.html'),'other');f.write();assert.equal(verifyProvenance(f.data,f.repo).cases[0].reason,'GIT_BLOB_MISMATCH');}));
test('unavailable commit is explicitly unverified',()=>withFixture(f=>{f.c.provenance.revision='abcdef0123456789';f.write();assert.equal(verifyProvenance(f.data,f.repo).cases[0].status,'UNVERIFIED');}));
test('unsafe source paths are rejected',()=>withFixture(f=>{f.c.provenance.source_path='../secret';f.write();assert.throws(()=>verifyProvenance(f.data,f.repo),/Invalid provenance/);}));
test('missing source path is a mismatch',()=>withFixture(f=>{f.c.provenance.source_path='absent.html';f.write();assert.equal(verifyProvenance(f.data,f.repo).cases[0].reason,'SOURCE_PATH_NOT_FOUND');}));
