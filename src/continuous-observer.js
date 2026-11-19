/** v4.2: bounded, privacy-minimal runtime state and request observations. */
import {contractFingerprint} from './interaction.js';
const STATES=new Set(['idle','validating','pending','success','error','unknown']);
const NEXT={idle:['validating','pending','error','success'],validating:['pending','error','idle'],pending:['success','error','unknown'],error:['idle','validating','pending'],success:['idle'],unknown:['idle','pending','error','success']};
export function validateObservationPolicy(policy,contract){
 const errors=[];
 if(!policy||policy.schema_version!=='4.2'||policy.contract_id!==contract.id)errors.push('policy version/contract_id mismatch');
 if(!Array.isArray(policy?.scenarios)||!policy.scenarios.length)return [...errors,'scenarios required'];
 const seen=new Set();
 for(const s of policy.scenarios){
  if(!contract.scenarios.some(x=>x.id===s.id)||seen.has(s.id))errors.push('unknown or duplicate scenario');seen.add(s.id);
  if(typeof s.selector!=='string'||!/^#[a-zA-Z][\w-]*$/.test(s.selector))errors.push('selector must be a simple #id');
  if(!Array.isArray(s.expected)||s.expected.length<2||s.expected.some(x=>!STATES.has(x)))errors.push('expected states invalid');
  if(s.network_url!==undefined&&(typeof s.network_url!=='string'||!s.network_url.startsWith('**/')))errors.push('network_url must be a path glob (**/...)');
 }
 return errors;
}
/** Browser-observed DOM transitions, not business outcomes. Gaps cannot be disproved by sampling. */
export function evaluateContinuousObservations(policy,contract,report){
 const errors=validateObservationPolicy(policy,contract);if(errors.length)throw Error(errors.join('; '));
 if(report?.contract_sha256!==contractFingerprint(contract))throw Error('Contract fingerprint mismatch');
 const results=[];
 for(const spec of policy.scenarios){
  const obs=report.scenarios?.find(s=>s.id===spec.id)?.observation;
  const issues=[];
  if(!obs||obs.status!=='CAPTURED'){results.push({id:spec.id,status:'NOT_VERIFIED',issues:['Observation missing or unavailable']});continue;}
  if(obs.overflow||obs.network_overflow||obs.navigation_gap)issues.push('Observation overflow or navigation gap');
  if(!Array.isArray(obs.events)||!obs.events.length)issues.push('No state events');
  const events=Array.isArray(obs.events)?obs.events:[];
  let previous=null,prior=-1;
  for(const event of events){
   if(!STATES.has(event.state)||!Number.isFinite(event.at_ms)||event.at_ms<prior||event.at_ms<0)issues.push('Invalid event state or timestamp');
   if(previous&&event.state!==previous&&!NEXT[previous]?.includes(event.state))issues.push(`Illegal transition ${previous} -> ${event.state}`);
   previous=event.state;prior=event.at_ms;
  }
  const actual=events.map(x=>x.state).filter((s,i,a)=>i===0||s!==a[i-1]);
  if(JSON.stringify(actual)!==JSON.stringify(spec.expected))issues.push(`Observed sequence ${actual.join(' -> ')} differs from required ${spec.expected.join(' -> ')}`);
  const requests=obs.requests;
  if(!Array.isArray(requests))issues.push('Network event list missing');
  else {
   for(const r of requests){if(!Number.isFinite(r.at_ms)||r.at_ms<0||!['request','response','failed'].includes(r.kind)||!Number.isInteger(r.id))issues.push('Invalid network event');}
   if(spec.network_url){const sent=requests.filter(r=>r.kind==='request'&&r.matched===true);if(sent.length!==1)issues.push(`Expected one matching request, observed ${sent.length}`);
    if(sent.length===1){const replies=requests.filter(r=>r.id===sent[0].id&&['response','failed'].includes(r.kind));if(replies.length!==1)issues.push('Request outcome missing or duplicated');else if(replies[0].at_ms<sent[0].at_ms)issues.push('Network response predates request');}
   }
  }
  const status=issues.length?(issues.some(x=>x.includes('overflow')||x.includes('missing')||x.includes('No state'))?'NOT_VERIFIED':'FAIL'):'OBSERVED_CONTRACT_MATCH';
  results.push({id:spec.id,status,issues,observed_states:actual,network_events:Array.isArray(requests)?requests.length:0});
 }
 return {schema_version:'4.2',status:results.every(x=>x.status==='OBSERVED_CONTRACT_MATCH')?'OBSERVED_CONTRACT_MATCH':'BLOCK',scenarios:results,limitations:['DOM mutation observations are scoped to an explicit state attribute, not application internals.','Microtask transitions, page navigations, or events before observer installation may be missed.','Matching DOM and network events does not verify server-side persistence or user consent.','Event timestamps are local to a scenario and not a cryptographic attestation.']};
}
