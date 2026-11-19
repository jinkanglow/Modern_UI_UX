import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInteraction} from '../src/interaction.js';
const contract={schema_version:'1.0',id:'dom-proof',target:'http://localhost:3000',scenarios:[{id:'failure',steps:[{action:'assert_only',expect:[{check:'visible',selector:'#submit'}]}]}]};
const make=(observe)=>({async open(){},async perform(){},async assert(){throw Error('missing')},async close(){},...(observe?{observe}:{})});
test('records structural observation without claiming source mapping',async()=>{
 const report=await verifyInteraction(contract,make(async()=>({status:'OBSERVED',match_count:1,tag_name:'button',source_mapping:{status:'UNVERIFIED',method:'none'},text:'SECRET',html:'<input value="SECRET">'})));
 const observation=report.findings[0].dom_observation;
 assert.deepEqual(observation,{status:'OBSERVED',match_count:1,tag_name:'button',source_mapping:{status:'UNVERIFIED',method:'none'}});
 assert.doesNotMatch(JSON.stringify(report),/SECRET/);
});
test('records not found as an observation, not a confirmed source defect',async()=>{
 const report=await verifyInteraction(contract,make(async()=>({status:'NOT_FOUND',match_count:0})));
 assert.equal(report.findings[0].dom_observation.status,'NOT_FOUND');
 assert.equal(report.findings[0].dom_observation.source_mapping.status,'UNVERIFIED');
});
test('marks unsupported adapters as unverified',async()=>{
 const report=await verifyInteraction(contract,make());
 assert.equal(report.findings[0].dom_observation.status,'UNVERIFIED');
});
test('observation errors do not hide original assertion failure',async()=>{
 const report=await verifyInteraction(contract,make(async()=>{throw Error('sensitive DOM');}));
 assert.equal(report.findings[0].rule_id,'FLOW-ASSERTION_FAILED');
 assert.equal(report.findings[0].dom_observation.status,'UNVERIFIED');
 assert.doesNotMatch(JSON.stringify(report),/sensitive DOM/);
});
