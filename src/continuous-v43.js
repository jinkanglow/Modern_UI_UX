/** v4.3: event-causality audit for bounded browser observations. No server-side claims. */
import {evaluateContinuousObservations} from './continuous-observer.js';
import {contractFingerprint} from './interaction.js';
const finite=t=>Number.isFinite(t)&&t>=0;
export function auditObservedCausality(policy,contract,report){
 const base=evaluateContinuousObservations(policy,contract,report);
 const findings=[];
 for(const spec of policy.scenarios){
  const obs=report?.scenarios?.find(s=>s.id===spec.id)?.observation;
  const issues=[];
  if(!obs||obs.status!=='CAPTURED'){
   findings.push({id:spec.id,status:'NOT_VERIFIED',issues:['No captured browser observation']});continue;
  }
  const events=obs.events??[],requests=obs.requests??[];
  if(obs.overflow||obs.network_overflow||obs.navigation_gap)issues.push({code:'EVIDENCE_GAP',status:'NOT_VERIFIED'});
  if(!Array.isArray(events)||!Array.isArray(requests))issues.push({code:'MALFORMED_EVENTS',status:'NOT_VERIFIED'});
  else {
   const active=new Map(),seen=new Set();let last=-1;
   for(const e of requests){
    if(!Number.isInteger(e.id)||e.id<1||!finite(e.at_ms)||e.at_ms<last||!['request','response','failed'].includes(e.kind)){
     issues.push({code:'NETWORK_ORDER_INVALID',status:'NOT_VERIFIED'});continue;
    }
    last=e.at_ms;
    if(e.kind==='request'){
     if(seen.has(e.id))issues.push({code:'DUPLICATE_REQUEST_ID',status:'NOT_VERIFIED'});
     seen.add(e.id);active.set(e.id,e);
     if(active.size>1)issues.push({code:'OVERLAPPING_REQUESTS',status:'FAIL'});
    }else{
     if(!active.has(e.id))issues.push({code:'ORPHAN_OUTCOME',status:'NOT_VERIFIED'});
     else active.delete(e.id);
    }
   }
   if(active.size)issues.push({code:'UNRESOLVED_REQUEST',status:'NOT_VERIFIED'});
   const pending=events.find(e=>e.state==='pending');
   const terminal=events.find(e=>e.state==='success'||e.state==='error');
   const matched=requests.filter(e=>e.kind==='request'&&e.matched===true);
   if(spec.network_url&&matched.length===1){
    const request=matched[0];const outcome=requests.find(e=>e.id===request.id&&e.kind!=='request');
    // Browser DOM and Node network clocks are not synchronized: do not compare timestamps across domains.
    if(terminal?.state==='success'&&outcome?.kind==='failed')issues.push({code:'SUCCESS_AFTER_NETWORK_FAILURE',status:'FAIL'});
    if(terminal?.state==='success'&&outcome?.kind==='response'&&outcome.status>=400)issues.push({code:'SUCCESS_AFTER_HTTP_ERROR',status:'FAIL'});
    if(terminal?.state==='error'&&outcome?.kind==='response'&&outcome.status>=200&&outcome.status<300)
     issues.push({code:'ERROR_AFTER_HTTP_SUCCESS',status:'REVIEW'});
   }
  }
  const baseResult=base.scenarios.find(x=>x.id===spec.id);
  const status=issues.some(x=>x.status==='NOT_VERIFIED')?'NOT_VERIFIED':issues.some(x=>x.status==='FAIL')?'FAIL':baseResult?.status!=='OBSERVED_CONTRACT_MATCH'?baseResult?.status??'NOT_VERIFIED':issues.length?'REVIEW':'OBSERVED_CONTRACT_MATCH';
  findings.push({id:spec.id,status,issues,base_status:baseResult?.status});
 }
 return {schema_version:'4.3',contract_sha256:contractFingerprint(contract),status:findings.every(f=>f.status==='OBSERVED_CONTRACT_MATCH')?'OBSERVED_CONTRACT_MATCH':'BLOCK',scenarios:findings,limitations:['DOM timestamps and Node network timestamps have independent origins; cross-clock ordering is indicative only, not proof of causality.','An HTTP response does not establish persisted business state.','Only explicitly matched network paths are observed; redirects and service workers may alter behavior.','The absence of a detected race does not prove race freedom.']};
}
