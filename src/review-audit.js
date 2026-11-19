import fs from 'node:fs';
import path from 'node:path';
import {checkSnapshots} from './dataset.js';
import {compareReviews} from './review.js';

/** Read-only completeness audit. It does not attest reviewer identity or independence. */
export function auditReviewDataset(dataset){
 const root=path.resolve(dataset);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Expected v1.3 draft dataset');
 const snapshots=checkSnapshots(root);
 const cases=[];
 const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 for(const item of manifest.cases){
  const issues=[];
  if(!safeId(item.id)){cases.push({id:String(item.id),status:'BLOCK',issues:['INVALID_CASE_ID']});continue;}
  const reviewDir=path.join(root,'reviews',item.id);
  let reviewers=[];
  if(fs.existsSync(reviewDir)){
   const st=fs.lstatSync(reviewDir);
   if(!st.isDirectory()||st.isSymbolicLink())issues.push('INVALID_REVIEW_DIRECTORY');
   else reviewers=fs.readdirSync(reviewDir).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).sort();
  }
  if(reviewers.length!==2)issues.push('REQUIRES_EXACTLY_TWO_REVIEWS');
  let comparison;
  if(reviewers.length===2){try{comparison=compareReviews({dataset:root,id:item.id,reviewers});}catch{issues.push('INVALID_OR_INCONSISTENT_REVIEWS');}}
  const adjudicationPath=path.join(root,'adjudications',`${item.id}.json`);
  if(!fs.existsSync(adjudicationPath))issues.push('MISSING_ADJUDICATION');
  else if(comparison){
   try{
    const st=fs.lstatSync(adjudicationPath);
    if(!st.isFile()||st.isSymbolicLink())throw Error('unsafe file');
    const a=JSON.parse(fs.readFileSync(adjudicationPath,'utf8'));
    const eq=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
    const expected=[...comparison.agreement,...(a.accepted_disagreements??[])].sort();
    const actual=(a.annotations??[]).map(x=>`${x.rule_id}:${x.line}:${x.status}`).sort();
    const decisions=[...(a.accepted_disagreements??[]),...(a.rejected_disagreements??[])];
    if(a.schema_version!=='1.4-adjudication'||a.case_id!==item.id||a.snapshot_sha256!==item.sha256||!eq(a.reviewers,reviewers)||!eq(a.agreement,comparison.agreement)||!eq(a.disagreements,comparison.disagreements)||!eq(a.reviewed_rule_ids,comparison.reviewed_rule_ids)||a.guideline_version!==comparison.guideline_version||!safeId(a.adjudicator)||reviewers.includes(a.adjudicator)||typeof a.rationale!=='string'||a.rationale.trim().length<10||!eq([...decisions].sort(),comparison.disagreements)||!eq(actual,expected)||new Set(decisions).size!==decisions.length)throw Error('invalid adjudication');
   }catch{issues.push('INVALID_OR_STALE_ADJUDICATION');}
  }
  cases.push({id:item.id,status:issues.length?'BLOCK':'READY_FOR_EXPORT',reviewers,disagreements:comparison?.disagreement_count??null,issues});
 }
 const badSnapshots=snapshots.counts.total-snapshots.counts.intact;
 return {schema_version:'3.6-review-audit',status:badSnapshots||cases.some(c=>c.status!=='READY_FOR_EXPORT')?'BLOCK':'READY_FOR_EXPORT',counts:{total:cases.length,ready:cases.filter(c=>c.status==='READY_FOR_EXPORT').length,blocked:cases.filter(c=>c.status==='BLOCK').length,invalid_snapshots:badSnapshots},cases,limitations:['Reviewer IDs are self-asserted; independence and identity are not verified.','A ready dataset is procedurally complete, not statistically representative.']};
}
