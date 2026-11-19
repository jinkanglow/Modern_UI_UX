import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateContract,verifyInteraction} from '../src/interaction.js';

const base={schema_version:'1.0',id:'initial-state',target:'http://localhost',scenarios:[{id:'initial',steps:[{action:'assert_only',state:'idle',expect:[{check:'text',selector:'#status',equals:'Idle'}]}]}]};

test('1.0 permits assertion-only initial state',()=>assert.deepEqual(validateContract(base),[]));
test('0.9 rejects assertion-only action explicitly',()=>assert.match(validateContract({...base,schema_version:'0.9'}).join(' '),/requires schema_version 1.0/));
test('1.0 permits double_click and request_count',()=>{
 const c=structuredClone(base);c.scenarios[0].steps=[{action:'double_click',selector:'#save',state:'pending',expect:[{check:'request_count',url:'https://example.test/save',equals:1,settle_ms:200}]}];
 assert.deepEqual(validateContract(c),[]);
});
test('invalid settle window is rejected',()=>{
 const c=structuredClone(base);c.scenarios[0].steps[0].expect[0].settle_ms=200;
 assert.match(validateContract(c).join(' '),/settle_ms requires request_count/);
});
test('successful scenarios do not persist traces by default',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-v10-'));
 const calls=[];
 const adapter={async open(){},async perform(){},async assert(){},async finishScenario(_dir,_id,options){calls.push(options.save);return options.save?{type:'trace',status:'CAPTURED'}:null;},async close(){}};
 try{const r=await verifyInteraction(base,adapter,{evidence_dir:dir});assert.equal(r.counts.passed,1);assert.deepEqual(calls,[false]);assert.equal(r.artifacts.length,0);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('explicit trace-all opt-in retains successful traces',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-v10-'));
 const adapter={async open(){},async perform(){},async assert(){},async finishScenario(_dir,_id,options){return options.save?{type:'trace',status:'CAPTURED'}:null;},async close(){}};
 try{const r=await verifyInteraction(base,adapter,{evidence_dir:dir,trace_on_success:true});assert.equal(r.artifacts.length,1);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed scenarios retain trace evidence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-v10-'));
 const adapter={async open(){},async perform(){},async assert(){throw Error('not idle');},async capture(){return null;},async finishScenario(_dir,_id,options){return options.save?{type:'trace',status:'CAPTURED'}:null;},async close(){}};
 try{const r=await verifyInteraction(base,adapter,{evidence_dir:dir});assert.equal(r.counts.failed,1);assert.equal(r.artifacts.filter(a=>a.type==='trace').length,1);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
