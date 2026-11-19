/** v4.0: bind state evidence to individual executed browser assertions; never infer backend or consent. */
import {contractFingerprint,validateContract,verifyInteraction} from './interaction.js';
import {validateStatePolicy,evaluateStateMachine} from './state-machine.js';
import {validateInteractionReportIntegrity} from './report-integrity.js';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const refKey=r=>`${r.scenario}/${r.step}/${r.check_index}`;
export function validateBrowserBindings(bindings,policy,contract){
 const errors=[...validateStatePolicy(policy,contract),...validateContract(contract)];
 if(!obj(bindings)||bindings.schema_version!=='4.0'||bindings.contract_id!==contract.id||!Array.isArray(bindings.flows))return [...errors,'Invalid v4.0 bindings envelope'];
 const ids=new Set();
 for(const [i,flow] of bindings.flows.entries()){
  const p=`flows[${i}]`,f=policy.flows.find(x=>x.id===flow?.id);
  if(!f||ids.has(flow.id)){errors.push(`${p} unknown or duplicate flow`);continue;}ids.add(flow.id);
  if(!Array.isArray(flow.state_bindings)||flow.state_bindings.length!==f.states.length)errors.push(`${p} state_bindings must cover each state`);
  else for(const [j,s] of flow.state_bindings.entries()){
   if(s?.state!==f.states[j])errors.push(`${p} state order mismatch at ${j}`);
   if(!validRef(s?.assertion,f,contract))errors.push(`${p} invalid state assertion at ${j}`);
  }
  if(Array.isArray(flow.state_bindings)&&flow.state_bindings.every(x=>validRef(x?.assertion,f,contract))){
   const positions=flow.state_bindings.map(x=>x.assertion.step*1000+x.assertion.check_index);
   if(positions.some((x,j)=>j>0&&x<=positions[j-1]))errors.push(`${p} state assertions must follow strictly increasing execution order`);
  }
  if(!Array.isArray(flow.evidence_bindings))errors.push(`${p} evidence_bindings required`);
  else {
   const seen=new Set();
   for(const b of flow.evidence_bindings){
    if(!f.required_evidence.some(e=>e.id===b?.id)||seen.has(b.id)){errors.push(`${p} duplicate or unknown evidence id`);continue;}seen.add(b.id);
    const def=f.required_evidence.find(e=>e.id===b.id);
    if(!['dom_assertion','network_observation'].includes(def.kind)||!validRef(b.assertion,f,contract))errors.push(`${p} unsupported evidence binding ${b.id}`);
    else {const check=contract.scenarios.find(s=>s.id===f.scenario).steps[b.assertion.step-1].expect[b.assertion.check_index];if(def.kind==='network_observation'&&check.check!=='request_count')errors.push(`${p} network evidence must use request_count`);if(def.kind==='dom_assertion'&&check.check==='request_count')errors.push(`${p} DOM evidence cannot use request_count`);}
   }
  }
 }
 for(const f of policy.flows)if(!ids.has(f.id))errors.push(`Missing bindings for flow ${f.id}`);
 return errors;
}
function validRef(r,f,contract){if(!obj(r)||r.scenario!==f.scenario||!Number.isInteger(r.step)||!Number.isInteger(r.check_index)||r.step<1||r.check_index<0)return false;const s=contract.scenarios.find(s=>s.id===r.scenario);return !!s?.steps[r.step-1]?.expect[r.check_index];}
/** The interaction report is untrusted until its internal consistency is checked. */
export function bridgeBrowserReport(bindings,policy,contract,report){
 const errors=validateBrowserBindings(bindings,policy,contract);if(errors.length)throw Error(errors.join('; '));
 if(!obj(report)||report.contract_sha256!==contractFingerprint(contract))throw Error('Browser report contract fingerprint mismatch');
 const integrity=validateInteractionReportIntegrity(report,contract);
 if(integrity.length)throw Error(`Browser report integrity failure: ${integrity.join('; ')}`);
 const scenarios=new Map(report.scenarios.map(s=>[s.id,s]));
 const flows=bindings.flows.map(binding=>{
  const f=policy.flows.find(f=>f.id===binding.id),observed=scenarios.get(f.scenario);
  const status=r=>{const step=observed?.steps?.[r.step-1];if(!step||step.index!==r.step)return 'UNVERIFIED';return step.checks?.[r.check_index]?.status??'UNVERIFIED';};
  const stateResults=binding.state_bindings.map(b=>status(b.assertion));
  // No state is asserted from a step label. Each non-initial state needs an actual passing assertion.
  const events=stateResults.every(x=>x==='PASS')?f.states.map((state,i)=>({state,sequence:i+1})):[];
  const evidence=binding.evidence_bindings.map(b=>({id:b.id,status:status(b.assertion)}));
  return {id:f.id,events,evidence};
 });
 const observations={schema_version:'3.9',contract_sha256:contractFingerprint(contract),flows};
 const evaluated=evaluateStateMachine(policy,contract,observations);
 return {...evaluated,schema_version:'4.0',observation_source:'BROWSER_REPORT_UNAUTHENTICATED',binding_contract_version:'4.0',limitations:[...evaluated.limitations,'Only explicitly bound assertions are used; browser assertion results do not establish backend completion or human authorization.','The supplied report may be fabricated; report integrity and contract hashes do not authenticate execution.','Assertion ordering proves only check execution order, not the precise moment the application entered each semantic state.']};
}
export async function executeBrowserState(bindings,policy,contract,adapter,options={}){
 const errors=validateBrowserBindings(bindings,policy,contract);if(errors.length)throw Error(errors.join('; '));
 const report=await verifyInteraction(contract,adapter,options);
 const result=bridgeBrowserReport(bindings,policy,contract,report);
 return {result,interaction:report};
}
