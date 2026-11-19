import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readContract,verifyInteraction,playwrightAdapter} from '../src/interaction.js';
import {auditObservedCausality} from '../src/continuous-v43.js';
import {startFrameworkServer} from './support/framework-server.js';
const enabled=process.env.UIUX_BROWSER_E2E==='1';
for(const framework of ['react','vue']){
 test(`Chromium ${framework}: v4.3 observed network causality`,{skip:!enabled&&'Requires Playwright, Vite, Chromium and UIUX_BROWSER_E2E=1'},async()=>{
  const server=await startFrameworkServer(framework);
  try{
   const contract=readContract('examples/frameworks/interaction-contract.json');contract.target=server.origin+'/';
   const policy=JSON.parse(fs.readFileSync('examples/continuous/policy.json','utf8'));
   const report=await verifyInteraction(contract,await playwrightAdapter('chromium'),{observation_policy:policy});
   const result=auditObservedCausality(policy,contract,report);
   assert.equal(result.status,'OBSERVED_CONTRACT_MATCH',JSON.stringify(result));
  }finally{await server.close();}
 });
}
