/** Dataset adequacy gate: distinguishes detector scores from evidence sufficient to support a claim. */
const keys=['min_cases','min_real_project_cases','min_independent_double_cases','min_positive_annotations','min_negative_cases','min_technologies'];
export function evaluationGate(report,policy){
 if(!report||!Array.isArray(report.cases)||!report.counts||!['1.2'].includes(report.schema_version))throw Error('Evaluation gate requires a v1.2 evaluation report with case provenance');
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(k=>!keys.includes(k))||keys.some(k=>!Number.isSafeInteger(policy[k])||policy[k]<0))throw Error(`Evaluation policy requires nonnegative integer values for ${keys.join(', ')}, and no unknown fields`);
 const cases=report.cases;
 if(cases.some(c=>!c||!['synthetic','real-project'].includes(c.origin)||!['single','independent-double'].includes(c.review_method)||typeof c.technology!=='string'||!c.counts))throw Error('Evaluation report lacks complete case provenance');
 const observed={cases:cases.length,real_project_cases:cases.filter(c=>c.origin==='real-project').length,independent_double_cases:cases.filter(c=>c.review_method==='independent-double').length,positive_annotations:report.counts.tp+report.counts.fn,negative_cases:cases.filter(c=>c.counts.tp===0&&c.counts.fn===0&&c.counts.uncertain_matched===0).length,technologies:new Set(cases.map(c=>c.technology)).size};
 const checks=keys.map(k=>{const field=k.slice(4);return {criterion:k,required:policy[k],observed:observed[field],pass:observed[field]>=policy[k]};});
 const accuracy={precision:report.precision,recall:report.recall,fp:report.counts.fp,fn:report.counts.fn,unexpected_unverified:report.counts.unexpected_unverified};
 const dataAdequate=checks.every(c=>c.pass);
 return {schema_version:'1.0',status:dataAdequate?'ADEQUATE_FOR_POLICY':'INSUFFICIENT_EVIDENCE',checks,observed,accuracy,accuracy_gate:'NOT_EVALUATED',limitations:['Policy thresholds describe dataset composition, not statistical representativeness or detector accuracy.','A negative case here has no positive or uncertain annotations; it is not necessarily exhaustively labeled.','Independent-double is reviewer metadata, not proof of adjudication quality.','No production UX, accessibility compliance or browser behavior claim follows from this gate.']};
}
