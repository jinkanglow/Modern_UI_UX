import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readContract,playwrightAdapter,verifyInteraction,evidenceManifest,verifyEvidenceManifest} from '../src/interaction.js';
import {startFixtureServer} from './support/fixture-server.js';
const enabled=process.env.UIUX_BROWSER_E2E==='1';
function contractAt(origin){
 const contract=readContract('examples/interaction/network-contract.json');
 contract.target=`${origin}/network.html`;
 return contract;
}
test('Chromium: success, 503, network abort and duplicate-submit contracts', {skip:!enabled&&'Requires UIUX_BROWSER_E2E=1 and installed Playwright Chromium'},async()=>{
 const server=await startFixtureServer();
 try{
  const contract=contractAt(server.origin);
  const adapter=await playwrightAdapter('chromium');
  const report=await verifyInteraction(contract,adapter);
  assert.equal(report.counts.scenarios,3);
  assert.equal(report.counts.failed,0,JSON.stringify(report.findings));
  assert.equal(report.artifacts.length,0,'No evidence should be collected by default');
 }finally{await server.close();}
});
test('Chromium: intentionally failing assertion produces evidence and detects tampering', {skip:!enabled&&'Requires UIUX_BROWSER_E2E=1 and installed Playwright Chromium'},async()=>{
 const server=await startFixtureServer();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-e2e-'));
 try{
  const contract=contractAt(server.origin);
  contract.scenarios=[{id:'expected-failure',steps:[{action:'assert_only',expect:[{check:'text',selector:'#status',equals:'Impossible',timeout_ms:200}]}]}];
  contract.schema_version='1.0';
  const adapter=await playwrightAdapter('chromium',{captureTrace:true});
  const report=await verifyInteraction(contract,adapter,{evidence_dir:dir});
  assert.equal(report.counts.failed,1);
  assert.equal(report.findings[0].rule_id,'FLOW-ASSERTION_FAILED');
  assert.equal(report.findings[0].dom_observation?.status,'OBSERVED');
  const captured=report.artifacts.filter(a=>a.status==='CAPTURED');
  assert.ok(captured.some(a=>a.type==='screenshot'));
  assert.ok(captured.some(a=>a.type==='trace'));
  const manifest=evidenceManifest(captured,{dir});
  assert.equal(verifyEvidenceManifest(manifest,dir).counts.intact,manifest.entries.length);
  fs.appendFileSync(captured.find(a=>a.type==='screenshot').path,'tampered');
  assert.ok(verifyEvidenceManifest(manifest,dir).results.some(x=>x.status!=='INTACT'));
 }finally{await server.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Chromium: execute assurance from real HTTP fixture without supplied report', {skip:!enabled&&'Requires UIUX_BROWSER_E2E=1 and installed Playwright Chromium'},async()=>{
 const {executeAssurance}=await import('../src/assurance.js');
 const server=await startFixtureServer();
 try{
  const contract=contractAt(server.origin);
  const tasks={schema_version:'2.1',id:'fixture-task-assurance',contract_id:contract.id,tasks:contract.scenarios.map(s=>({id:`task-${s.id}`,actor:'test operator',goal:'Exercise the declared scenario',completion_condition:'All declared browser assertions pass',required_scenarios:[s.id]}))};
  const result=await executeAssurance({contract,tasks});
  assert.equal(result.assurance.gate.status,'CONTRACT_PASS',JSON.stringify(result.interaction.findings));
  assert.equal(result.assurance.execution.status,'IN_PROCESS_OBSERVED_NOT_ATTESTED');
  assert.equal(result.assurance.counts.verified_contract,tasks.tasks.length);
 }finally{await server.close();}
});
