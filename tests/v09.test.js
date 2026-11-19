import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateContract,verifyInteraction} from '../src/interaction.js';
import {unifiedReport,unifiedMarkdown} from '../src/unified.js';
const contract={schema_version:'0.9',id:'case',target:'http://localhost',scenarios:[{id:'capture',steps:[{action:'click',selector:'#save',state:'pending',expect:[{check:'visible',selector:'#status'}]}]}]};
test('0.9 contract accepted without breaking old versions',()=>assert.deepEqual(validateContract(contract),[]));
test('failed assertions capture evidence, trace, and close',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-evidence-'));const calls=[];
 const adapter={async open(){calls.push('open');},async perform(){calls.push('click');},async assert(){throw Error('not visible');},async capture(d,s,step){calls.push('capture');return {scenario:s,step,type:'screenshot',status:'CAPTURED',path:path.join(d,'fake.png')};},async finishScenario(){calls.push('trace');return {type:'trace',status:'CAPTURED',path:'fake.trace.zip'};},async close(){calls.push('close');}};
 try{const r=await verifyInteraction(contract,adapter,{evidence_dir:dir});assert.equal(r.counts.failed,1);assert.equal(r.artifacts.length,2);assert.deepEqual(calls,['open','click','capture','trace','close']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('capture failure is UNVERIFIED, never reported as captured',async()=>{
 const adapter={async open(){},async perform(){},async assert(){throw Error('failed');},async capture(){throw Error('disk full');},async close(){}};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-evidence-'));
 try{const r=await verifyInteraction(contract,adapter,{evidence_dir:dir});assert.equal(r.artifacts[0].status,'UNVERIFIED');assert.match(r.artifacts[0].reason,/disk full/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unified gate uses confirmed errors and browser failures, not heuristic warnings',()=>{
 const staticReport={findings:[{status:'UNVERIFIED',severity:'error'},{status:'FAIL',severity:'warning'}]};
 const interaction={findings:[],scenarios:[{id:'ok',status:'PASS'}]};
 const r=unifiedReport(staticReport,interaction);assert.equal(r.gates.blocked,false);assert.equal(r.gates.unverified,1);assert.match(unifiedMarkdown(r),/Browser scenarios/);
 interaction.findings.push({status:'FAIL'});assert.equal(unifiedReport(staticReport,interaction).gates.blocked,true);
 staticReport.findings.push({status:'FAIL',severity:'error'});assert.equal(unifiedReport(staticReport,{findings:[],scenarios:[]}).gates.blocked,true);
});
