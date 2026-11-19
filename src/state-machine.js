/** v3.9: explicit observed-state evidence, separate from declared interaction step labels. */
import {contractFingerprint,validateContract} from './interaction.js';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const states=new Set(['idle','validating','pending','success','error','unknown']);
const transitions={idle:['validating','pending','error'],validating:['pending','error','idle'],pending:['success','error','unknown'],success:['idle'],error:['idle','validating','pending'],unknown:['idle','pending','error']};
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(x);
const evidenceKinds=new Set(['dom_assertion','network_observation','backend_receipt','human_review']);
export function validateStatePolicy(policy,contract){
 const errors=[];
 if(!isObject(policy)||policy.schema_version!=='3.9')return ['policy schema_version must be 3.9'];
 if(!isObject(contract)||validateContract(contract).length)errors.push('invalid interaction contract');
 if(policy.contract_id!==contract?.id)errors.push('contract_id mismatch');
 if(!Array.isArray(policy.flows)||policy.flows.length<1||policy.flows.length>100)return [...errors,'flows must contain 1..100 entries'];
 const seen=new Set(),scenarioIds=new Set((contract?.scenarios??[]).map(x=>x.id));
 for(const [i,f] of policy.flows.entries()){
  const p=`flows[${i}]`;
  if(!isObject(f)||!id(f.id)||seen.has(f.id)){errors.push(`${p} invalid/duplicate id`);continue;}seen.add(f.id);
  if(!id(f.scenario)||!scenarioIds.has(f.scenario))errors.push(`${p} unknown scenario`);
  if(!['ordinary','ai_assisted','agent_action'].includes(f.kind))errors.push(`${p} invalid kind`);
  if(!Array.isArray(f.states)||f.states.length<2||f.states.length>100||f.states.some(s=>!states.has(s)))errors.push(`${p} invalid states`);
  else {if(f.states[0]!=='idle')errors.push(`${p} must start idle`);for(let j=1;j<f.states.length;j++)if(!transitions[f.states[j-1]].includes(f.states[j]))errors.push(`${p} illegal transition ${j}`);}
  if(!Array.isArray(f.required_evidence)||f.required_evidence.length===0||f.required_evidence.length>50)errors.push(`${p} requires evidence`);
  else for(const [j,e] of f.required_evidence.entries())if(!isObject(e)||!id(e.id)||!evidenceKinds.has(e.kind)||!['state','authorization','uncertainty','outcome'].includes(e.purpose))errors.push(`${p}.required_evidence[${j}] invalid`);
  if(f.kind==='agent_action'&&!f.required_evidence?.some(e=>e.purpose==='authorization'))errors.push(`${p} agent action requires authorization evidence`);
  if(f.kind==='ai_assisted'&&!f.required_evidence?.some(e=>e.purpose==='uncertainty'))errors.push(`${p} AI workflow requires uncertainty evidence`);
  if(f.claim_business_completion===true&&!f.required_evidence?.some(e=>e.kind==='backend_receipt'&&e.purpose==='outcome'))errors.push(`${p} business completion requires backend receipt`);
 }
 return errors;
}
/** Observations are externally supplied; structural validation is NOT attestation. */
export function evaluateStateMachine(policy,contract,observations=null){
 const errors=validateStatePolicy(policy,contract);if(errors.length)throw Error(errors.join('; '));
 if(observations!==null&&(!isObject(observations)||observations.schema_version!=='3.9'||observations.contract_sha256!==contractFingerprint(contract)||!Array.isArray(observations.flows)))throw Error('Observation envelope or contract fingerprint invalid');
 const map=new Map();
 for(const o of observations?.flows??[]){if(!isObject(o)||!id(o.id)||map.has(o.id)||!Array.isArray(o.events)||!Array.isArray(o.evidence)||o.events.length>100||o.evidence.length>100)throw Error('Malformed or duplicate flow observation');map.set(o.id,o);}
 if([...map.keys()].some(k=>!policy.flows.some(f=>f.id===k)))throw Error('Undeclared flow observation');
 const flows=policy.flows.map(f=>{
  const o=map.get(f.id);if(!o)return {id:f.id,status:'NOT_VERIFIED',reason:'No observation supplied'};
  if(o.events.some(e=>!isObject(e)||!states.has(e.state)||!Number.isInteger(e.sequence)||e.sequence<1))throw Error(`Invalid events in ${f.id}`);
  if(o.evidence.some(e=>!isObject(e)||!id(e.id)||!['PASS','FAIL','UNVERIFIED'].includes(e.status)))throw Error(`Invalid evidence in ${f.id}`);
  if(new Set(o.evidence.map(e=>e.id)).size!==o.evidence.length)throw Error(`Duplicate evidence in ${f.id}`);
  const sequence=o.events.map(e=>e.state);
  const exact=sequence.length===f.states.length&&sequence.every((s,i)=>s===f.states[i]&&o.events[i].sequence===i+1);
  const evidence=f.required_evidence.map(e=>({id:e.id,kind:e.kind,purpose:e.purpose,status:o.evidence.find(x=>x.id===e.id)?.status??'UNVERIFIED'}));
  const failed=evidence.some(e=>e.status==='FAIL');
  const incomplete=!exact||evidence.some(e=>e.status==='UNVERIFIED');
  const status=failed?'FAIL':incomplete?'NOT_VERIFIED':'CONTRACT_PASS';
  const backend=evidence.some(e=>e.kind==='backend_receipt'&&e.purpose==='outcome'&&e.status==='PASS');
  return {id:f.id,status,transition_match:exact,evidence,business_completion_claim:status==='CONTRACT_PASS'&&f.claim_business_completion===true&&backend?'RECEIPT_REPORTED_UNAUTHENTICATED':'NOT_ESTABLISHED'};
 });
 return {schema_version:'3.9',contract_id:contract.id,observation_source:observations?'SUPPLIED_UNAUTHENTICATED':'NONE',flows,counts:{total:flows.length,passed:flows.filter(f=>f.status==='CONTRACT_PASS').length,failed:flows.filter(f=>f.status==='FAIL').length,not_verified:flows.filter(f=>f.status==='NOT_VERIFIED').length},limitations:['State events and evidence statuses are supplied observations, not independently captured or authenticated.','A matching sequence does not prove the application actually entered those states.','A reported backend receipt does not establish transaction completion without independent verification.']};
}
