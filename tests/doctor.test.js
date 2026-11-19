import test from 'node:test';
import assert from 'node:assert/strict';
import {doctor} from '../src/doctor.js';
test('doctor reports all missing packages without claiming browser execution',()=>{
 const r=doctor({resolvePackage:()=>{throw Error('absent');}});
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.filter(x=>x.status==='MISSING').length,6);
 assert.equal(r.checks.at(-1).status,'NOT_CHECKED');
});
test('doctor reports browser missing after package availability',()=>{
 const r=doctor({resolvePackage:()=>'/mock/package.json',browserExecutable:'/nonexistent/chromium',fileExists:()=>false});
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.at(-1).status,'MISSING');
});
test('doctor marks ready only when all packages and browser exist',()=>{
 const r=doctor({resolvePackage:()=>'/mock/package.json',browserExecutable:'/mock/chromium',fileExists:()=>true});
 assert.equal(r.status,'READY');assert.equal(r.checks.length,7);
 assert.ok(r.limitations.some(x=>x.includes('no browser launched')));
});
test('doctor has no executable locations in its output',()=>{
 const r=doctor({resolvePackage:()=>'/sensitive/path/package.json',browserExecutable:'/sensitive/path/chromium',fileExists:()=>true});
 assert.ok(!JSON.stringify(r).includes('/sensitive/path'));
});
