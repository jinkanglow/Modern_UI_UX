/** Validate both CI receipts and emit a fail-closed, privacy-minimized summary. */
import fs from 'node:fs';
import path from 'node:path';
import {verifyCiBundleDirectory} from '../src/ci-bundle.js';
import {writeCiJsonAtomic} from '../src/ci-run-files.js';
const directory=path.resolve(process.argv[2]??'ci-receipts');
const result=verifyCiBundleDirectory(directory,{expectedRevision:process.env.GITHUB_SHA??null,expectedRunId:process.env.GITHUB_RUN_ID??null});
fs.mkdirSync(directory,{recursive:true});
writeCiJsonAtomic(directory,'bundle-verification.json',result);
console.log(`CI bundle: ${result.status} (${result.errors.length} validation errors)`);
if(result.status!=='CONTRACT_PASS')process.exitCode=1;
