/** v4.4 network outcome classification. A transport error is not proof of user cancellation. */
export function classifyNetworkOutcome(event){
 if(!event||typeof event!=='object')return {category:'UNKNOWN',confidence:'UNVERIFIED'};
 if(event.kind==='response'){
  if(!Number.isInteger(event.status)||event.status<100||event.status>599)return {category:'UNKNOWN',confidence:'UNVERIFIED'};
  return {category:event.status>=400?'HTTP_ERROR':'HTTP_RESPONSE',confidence:'OBSERVED',http_status:event.status};
 }
 if(event.kind!=='failed')return {category:'UNKNOWN',confidence:'UNVERIFIED'};
 const reason=typeof event.failure_text==='string'?event.failure_text.toLowerCase():'';
 if(event.cancel_signal===true)return {category:'CANCEL_REQUESTED',confidence:'CORRELATED_NOT_PROVEN',transport_reason:reason||null};
 if(/timed?_?out|timeout/.test(reason))return {category:'TIMEOUT',confidence:'TRANSPORT_REPORTED'};
 if(/abort|cancel/.test(reason))return {category:'ABORTED_UNKNOWN_ACTOR',confidence:'TRANSPORT_REPORTED'};
 if(reason)return {category:'NETWORK_FAILURE',confidence:'TRANSPORT_REPORTED'};
 return {category:'NETWORK_FAILURE_UNCLASSIFIED',confidence:'UNVERIFIED'};
}
export function auditNetworkOutcomes(report){
 const scenarios=[];
 for(const s of report?.scenarios??[]){
  const obs=s.observation;
  if(!obs||obs.status!=='CAPTURED'){scenarios.push({id:s.id,status:'NOT_VERIFIED',outcomes:[]});continue;}
  const requests=Array.isArray(obs.requests)?obs.requests:[];
  const outcomes=requests.filter(e=>e.kind==='response'||e.kind==='failed').map(e=>({id:e.id,...classifyNetworkOutcome(e)}));
  const status=obs.network_overflow||obs.navigation_gap||!Array.isArray(obs.requests)||outcomes.some(o=>o.confidence==='UNVERIFIED')?'NOT_VERIFIED':'CLASSIFIED';
  scenarios.push({id:s.id,status,outcomes});
 }
 return {schema_version:'4.4',status:scenarios.length&&scenarios.every(s=>s.status==='CLASSIFIED')?'CLASSIFIED':'NOT_VERIFIED',scenarios,limitations:['Abort-like transport errors do not identify the actor that caused cancellation.','A timeout classification requires an observed timeout reason, not elapsed time alone.','HTTP responses do not prove backend persistence.','This report does not authenticate its browser origin.']};
}
