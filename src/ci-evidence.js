/** v3.0: Privacy-minimized CI execution receipt. A receipt is NOT runner attestation. */
import {createHash} from 'node:crypto';
const hex=x=>createHash('sha256').update(x).digest('hex');
const sha=/^[a-f0-9]{64}$/;
const safeId=/^[a-zA-Z0-9_.-]{1,100}$/;
export function ciReceipt(assurance,{framework,runId=null,revision=null}={}){
 if(!['react','vue'].includes(framework))throw Error('Unsupported framework');
 if(!assurance||typeof assurance!=='object'||!assurance.gate||!assurance.execution||!assurance.counts)throw Error('Invalid assurance report');
 if(!sha.test(assurance.contract_sha256??''))throw Error('Missing contract digest');
 if(!safeId.test(assurance.contract_id??'')||!safeId.test(assurance.manifest_id??''))throw Error('Invalid contract or task ID');
 if(runId!==null&&!/^\d{1,20}$/.test(String(runId)))throw Error('Invalid CI run ID');
 if(revision!==null&&!/^[0-9a-f]{40}$/.test(revision))throw Error('Invalid commit SHA');
 const gate=assurance.gate.status;
 if(!['CONTRACT_PASS','BLOCK','INCOMPLETE','INFRA_ERROR'].includes(gate)||assurance.gate.blocks_ci!==(gate!=='CONTRACT_PASS'))throw Error('Contradictory gate');
 if(!['IN_PROCESS_OBSERVED_NOT_ATTESTED','REPORT_SUPPLIED_UNAUTHENTICATED','NOT_EXECUTED'].includes(assurance.execution.status))throw Error('Invalid execution status');
 if(!['CONTRACT_PASS'].includes(gate)&&assurance.execution.status==='NOT_EXECUTED'&&assurance.counts.verified_contract>0)throw Error('Unexecuted tasks cannot be verified');
 const counts=assurance.counts;
 for(const field of ['verified_contract','failed','not_verified'])if(!Number.isSafeInteger(counts[field])||counts[field]<0)throw Error('Invalid task counts');
 if(!Array.isArray(assurance.tasks)||assurance.tasks.length!==counts.verified_contract+counts.failed+counts.not_verified)throw Error('Task count mismatch');
 if(gate==='CONTRACT_PASS'&&(assurance.execution.status!=='IN_PROCESS_OBSERVED_NOT_ATTESTED'||counts.failed!==0||counts.not_verified!==0||counts.verified_contract===0))throw Error('CI pass requires in-process execution of all tasks');
 const canonical=JSON.stringify(assurance);
 return {schema_version:'3.0',kind:'CI_EXECUTION_RECEIPT',framework,contract_id:assurance.contract_id,manifest_id:assurance.manifest_id,contract_sha256:assurance.contract_sha256,assurance_sha256:hex(canonical),run_id:runId===null?null:String(runId),revision,gate,task_counts:{verified:counts.verified_contract,failed:counts.failed,not_verified:counts.not_verified},execution_status:assurance.execution.status,attestation:'NOT_ATTESTED',warning:'Self-reported CI metadata and SHA-256 do not establish runner identity, browser authenticity or backend completion.'};
}
