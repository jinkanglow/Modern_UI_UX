/** Run React/Vue fixtures using a real browser. Output only privacy-minimized receipts. */
import fs from 'node:fs';
import path from 'node:path';
import {readContract} from '../src/interaction.js';
import {executeAssuranceSafely} from '../src/assurance.js';
import {ciReceipt} from '../src/ci-evidence.js';
import {startFrameworkServer} from '../tests/support/framework-server.js';
import {prepareCiReceiptDirectory,writeCiJsonAtomic} from '../src/ci-run-files.js';
const directory=path.resolve(process.argv[2]??'ci-receipts');
prepareCiReceiptDirectory(directory);
let failed=false;
for(const framework of ['react','vue']){
 let server;
 try{
  server=await startFrameworkServer(framework);
  const contract=readContract('examples/frameworks/interaction-contract.json');
  contract.target=server.origin+'/';
  const tasks=JSON.parse(fs.readFileSync('examples/frameworks/tasks.json','utf8'));
  const {assurance}=await executeAssuranceSafely({contract,tasks,browser:'chromium'});
  const receipt=ciReceipt(assurance,{framework,runId:process.env.GITHUB_RUN_ID??null,revision:process.env.GITHUB_SHA??null});
  writeCiJsonAtomic(directory,`${framework}.json`,receipt);
  console.log(`${framework}: ${receipt.gate}, ${receipt.task_counts.verified} verified tasks`);
  if(receipt.gate!=='CONTRACT_PASS')failed=true;
 }catch(e){failed=true;console.error(`${framework}: runner could not generate receipt (${e?.name==='Error'?'ERROR':'EXCEPTION'})`);}
 finally{if(server)await server.close();}
}
if(failed)process.exitCode=1;
