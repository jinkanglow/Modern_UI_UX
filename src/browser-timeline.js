/** Assertion completion chronology, not a claim of semantic state-transition times. */
import {validateBrowserBindings} from './browser-state-bridge.js';
import {validateInteractionReportIntegrity} from './report-integrity.js';
import {contractFingerprint} from './interaction.js';
const finite=x=>Number.isSafeInteger(x)&&x>=0;
export function browserTimeline(bindings,policy,contract,report){
 const problems=validateBrowserBindings(bindings,policy,contract);
 if(problems.length)throw Error(`Invalid bindings: ${problems.join('; ')}`);
 if(report?.contract_sha256!==contractFingerprint(contract))throw Error('Contract fingerprint mismatch');
 const integrity=validateInteractionReportIntegrity(report,contract);
 if(integrity.length)throw Error(`Report integrity failure: ${integrity.join('; ')}`);
 const scenarios=new Map(report.scenarios.map(s=>[s.id,s]));
 const flows=bindings.flows.map(flow=>{
  const events=[];let previous=-1,status='OBSERVED_ASSERTIONS',reason=null;
  for(const binding of flow.state_bindings){
   const ref=binding.assertion;
   const step=scenarios.get(ref.scenario)?.steps?.[ref.step-1];
   const check=step?.checks?.[ref.check_index];
   if(!check||check.status!=='PASS'){
    status=check?.status==='FAIL'?'ASSERTION_FAILED':'NOT_VERIFIED';reason='Bound assertion did not pass';break;
   }
   const timing=check.timing;
   if(!timing||!finite(timing.start_ms)||!finite(timing.end_ms)||timing.end_ms<timing.start_ms){
    status='TIMING_UNVERIFIED';reason='Missing or invalid monotonic assertion timestamps';break;
   }
   if(timing.start_ms<previous){status='TIMELINE_INCONSISTENT';reason='Assertion start precedes earlier assertion completion';break;}
   previous=timing.end_ms;
   events.push({state:binding.state,scenario:ref.scenario,step:ref.step,check_index:ref.check_index,assertion_started_ms:timing.start_ms,assertion_completed_ms:timing.end_ms,assertion_duration_ms:timing.end_ms-timing.start_ms});
  }
  return {id:flow.id,status,reason,events,expected_states:flow.state_bindings.length,observed_states:events.length};
 });
 return {schema_version:'4.1',source:'UNAUTHENTICATED_BROWSER_REPORT',time_origin:'scenario_monotonic_elapsed_ms',flows,status:flows.every(f=>f.status==='OBSERVED_ASSERTIONS')?'ASSERTIONS_TIMED':'NOT_VERIFIED',limitations:['Timestamps record when assertions were evaluated and completed, not when application state changed.','Short-lived states can be missed between checks; this is not a continuous DOM observer.','Each scenario has an independent monotonic time origin; timestamps cannot be compared across scenarios.','Browser reports and their timestamps are not cryptographically authenticated.','DOM assertions cannot establish backend completion or human authorization.']};
}
