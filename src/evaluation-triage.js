/** Deterministic error inventory for frozen, line-level evaluation reports.
 * This is a review queue, not evidence of production detector accuracy.
 */
const kinds=[['false_positives','FALSE_POSITIVE'],['false_negatives','FALSE_NEGATIVE'],['unexpected_unverified','UNEXPECTED_UNVERIFIED']];
const priorities={FALSE_NEGATIVE:0,FALSE_POSITIVE:1,UNEXPECTED_UNVERIFIED:2};
function validFinding(f){return f&&typeof f.rule_id==='string'&&f.rule_id.length>0&&Number.isSafeInteger(f.line)&&f.line>0&&['FAIL','UNVERIFIED'].includes(f.status);}
export function evaluationTriage(report,{baseline=null}={}){
 if(!report||report.schema_version!=='1.2'||!Array.isArray(report.cases)||!report.counts)throw Error('Triage requires a v1.2 evaluation report');
 const ids=new Set(),issues=[];
 for(const c of report.cases){
  if(!c||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(c.sha256)||typeof c.annotation_sha256!=='string'||!/^[a-f0-9]{64}$/i.test(c.annotation_sha256)||typeof c.technology!=='string'||!['synthetic','real-project'].includes(c.origin)||!c.counts)throw Error('Triage requires unique frozen case IDs, hashes and provenance');
  ids.add(c.id);
  for(const [field,kind] of kinds){
   if(!Array.isArray(c[field])||c[field].length!==c.counts[field==='false_positives'?'fp':field==='false_negatives'?'fn':'unexpected_unverified'])throw Error(`Missing or inconsistent ${field} in ${c.id}`);
   for(const finding of c[field]){
    if(!validFinding(finding))throw Error(`Invalid ${field} entry in ${c.id}`);
    issues.push({case_id:c.id,file:c.file,origin:c.origin,technology:c.technology,kind,rule_id:finding.rule_id,line:finding.line,status:finding.status});
   }
  }
 }
 const sums={fp:issues.filter(i=>i.kind==='FALSE_POSITIVE').length,fn:issues.filter(i=>i.kind==='FALSE_NEGATIVE').length,unexpected_unverified:issues.filter(i=>i.kind==='UNEXPECTED_UNVERIFIED').length};
 for(const [k,v] of Object.entries(sums))if(v!==report.counts[k])throw Error(`Triage totals disagree with report counts: ${k}`);
 issues.sort((a,b)=>priorities[a.kind]-priorities[b.kind]||a.rule_id.localeCompare(b.rule_id)||a.case_id.localeCompare(b.case_id)||a.line-b.line);
 const byRule={};for(const i of issues){const r=byRule[i.rule_id]??={false_negatives:0,false_positives:0,unexpected_unverified:0};r[i.kind==='FALSE_NEGATIVE'?'false_negatives':i.kind==='FALSE_POSITIVE'?'false_positives':'unexpected_unverified']++;}
 const result={schema_version:'1.0',status:issues.length?'REVIEW_REQUIRED':'NO_OBSERVED_ERRORS',scope:'frozen line-level source-pattern evaluation',counts:{...sums,total:issues.length},by_rule:Object.fromEntries(Object.entries(byRule).sort(([a],[b])=>a.localeCompare(b))),issues,limitations:['Zero observed errors does not establish zero false positives or false negatives in untested projects.','Only annotated and reviewed rule coverage is evaluated; negative cases may not be exhaustively labeled.','No live browser, UX outcome, or accessibility conformance claim follows from this report.']};
 if(baseline){
  if(baseline.schema_version!=='1.2'||!Array.isArray(baseline.cases))throw Error('Baseline must be a v1.2 evaluation report');
  const previous=new Map(baseline.cases.map(c=>[c.id,c]));
  const same=previous.size===report.cases.length&&report.cases.every(c=>{const p=previous.get(c.id);return p&&p.sha256===c.sha256&&p.annotation_sha256===c.annotation_sha256&&p.review_method===c.review_method&&JSON.stringify(p.reviewed_rule_ids??null)===JSON.stringify(c.reviewed_rule_ids??null);});
  if(!same)throw Error('Baseline comparison requires identical case IDs, content, annotations, review methods and rule coverage');
  const prior=evaluationTriage(baseline);
  const key=i=>`${i.case_id}|${i.kind}|${i.rule_id}|${i.line}|${i.status}`;
  const old=new Set(prior.issues.map(key)),now=new Set(issues.map(key));
  result.regression={comparable:true,new_errors:issues.filter(i=>!old.has(key(i))),resolved_errors:prior.issues.filter(i=>!now.has(key(i))),unchanged_errors:issues.filter(i=>old.has(key(i))).length};
  if(result.regression.new_errors.length)result.status='REGRESSION';
 }
 return result;
}
