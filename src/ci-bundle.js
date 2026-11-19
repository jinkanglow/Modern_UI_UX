/** Validate a pair of privacy-minimized CI receipts; no claim of runner attestation. */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const hash=/^[a-f0-9]{64}$/;
const keys=['react','vue'];
export function verifyCiBundle(receipts,{expectedRevision=null,expectedRunId=null}={}){
 const errors=[];
 if(!receipts||typeof receipts!=='object'||Array.isArray(receipts))throw Error('Expected receipt map');
 const entries={};
 for(const framework of keys){
  const r=receipts[framework];
  if(!r||typeof r!=='object'||Array.isArray(r)){errors.push(`${framework}:MISSING_RECEIPT`);continue;}
  const fail=reason=>errors.push(`${framework}:${reason}`);
  if(r.schema_version!=='3.0'||r.kind!=='CI_EXECUTION_RECEIPT'||r.framework!==framework)fail('INVALID_SCHEMA');
  if(r.attestation!=='NOT_ATTESTED'||r.execution_status!=='IN_PROCESS_OBSERVED_NOT_ATTESTED')fail('UNSUPPORTED_PROVENANCE');
  if(r.gate!=='CONTRACT_PASS')fail('GATE_NOT_PASSED');
  if(!r.task_counts||!Number.isSafeInteger(r.task_counts.verified)||r.task_counts.verified<1||r.task_counts.failed!==0||r.task_counts.not_verified!==0)fail('INVALID_TASK_COUNTS');
  if(!hash.test(r.contract_sha256??'')||!hash.test(r.assurance_sha256??''))fail('INVALID_DIGEST');
  if(typeof r.contract_id!=='string'||!r.contract_id||typeof r.manifest_id!=='string'||!r.manifest_id)fail('INVALID_IDS');
  if(expectedRevision!==null&&r.revision!==expectedRevision)fail('REVISION_MISMATCH');
  if(expectedRunId!==null&&r.run_id!==String(expectedRunId))fail('RUN_ID_MISMATCH');
  entries[framework]={contract_id:r.contract_id,manifest_id:r.manifest_id,contract_sha256:r.contract_sha256,assurance_sha256:r.assurance_sha256,verified_tasks:r.task_counts?.verified??null,receipt_sha256:sha256(JSON.stringify(r))};
 }
 if(entries.react&&entries.vue){
  for(const key of ['contract_id','manifest_id','contract_sha256'])if(entries.react[key]!==entries.vue[key])errors.push(`CROSS_FRAMEWORK_${key.toUpperCase()}_MISMATCH`);
  if(receipts.react.revision!==receipts.vue.revision||receipts.react.run_id!==receipts.vue.run_id)errors.push('CROSS_FRAMEWORK_RUN_MISMATCH');
 }
 return {schema_version:'3.1',kind:'CI_BUNDLE_VERIFICATION',status:errors.length?'BLOCK':'CONTRACT_PASS',attestation:'NOT_ATTESTED',frameworks:entries,errors:[...new Set(errors)].sort(),warning:'Receipt hashes check bytes and consistency only. No independent runner identity or browser authenticity is established.'};
}
export function verifyCiBundleDirectory(directory,options={}){
 const receipts={};
 for(const framework of keys){
  const file=path.join(directory,`${framework}.json`);
  try{if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Not a regular receipt');receipts[framework]=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{receipts[framework]=null;}
 }
 return verifyCiBundle(receipts,options);
}
