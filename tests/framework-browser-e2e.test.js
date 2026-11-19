import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readContract,verifyInteraction,playwrightAdapter,contractFingerprint} from '../src/interaction.js';
import {taskCoverage} from '../src/tasks.js';
import {startFrameworkServer} from './support/framework-server.js';
const enabled=process.env.UIUX_BROWSER_E2E==='1';
for(const framework of ['react','vue']){
 test(`Chromium ${framework}: cross-component validation, save, duplicate-submit, HTTP 503, abort`,{skip:!enabled&&'Requires Playwright Chromium and UIUX_BROWSER_E2E=1'},async()=>{
  const server=await startFrameworkServer(framework);
  try{
   const contract=readContract('examples/frameworks/interaction-contract.json');contract.target=server.origin+'/';
   const report=await verifyInteraction(contract,await playwrightAdapter('chromium'));
   assert.equal(report.counts.scenarios,4);
   assert.equal(report.counts.failed,0,JSON.stringify(report.findings));
   assert.equal(report.scenarios.length,4);
   assert.equal(report.contract_sha256,contractFingerprint(contract));
   const manifest=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
   const taskReport=taskCoverage(manifest,contract,report);
   assert.equal(taskReport.counts.verified_contract,4);
   assert.equal(taskReport.counts.failed,0);
   assert.equal(taskReport.counts.not_verified,0);
  }finally{await server.close();}
 });
}
