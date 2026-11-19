import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {rules} from './rules.js';
import {auditReviewDataset} from './review-audit.js';

const ids=new Set(rules.map(r=>r.id));
const statuses=new Set(['FAIL','UNVERIFIED']);
const reviewerPattern=/^[a-zA-Z0-9_-]{2,80}$/;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const load=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const key=a=>`${a.rule_id}:${a.line}:${a.status}`;
function baseAndManifest(dir){const base=path.resolve(dir);const manifest=load(path.join(base,'manifest.json'));if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Expected v1.3 draft dataset');return {base,manifest};}
function safe(base,relative){if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Invalid dataset-relative path');const file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw Error('Path escapes dataset');const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected regular non-symlink file');return file;}
function caseFor(manifest,id){const item=manifest.cases.find(c=>c.id===id);if(!item)throw Error(`Unknown case ${id}`);return item;}
function validateSnapshot(base,item){const file=safe(base,item.file);if(sha(fs.readFileSync(file))!==item.sha256)throw Error(`Snapshot integrity mismatch: ${item.id}`);return file;}
function validateAnnotations(annotations,source){if(!Array.isArray(annotations))throw Error('annotations must be an array');const limit=source.toString('utf8').split(/\r?\n/).length,seen=new Set();for(const a of annotations){if(!a||!ids.has(a.rule_id)||!Number.isInteger(a.line)||a.line<1||a.line>limit||!statuses.has(a.status))throw Error('Invalid annotation rule, line or status');if(seen.has(key(a)))throw Error('Duplicate annotation');seen.add(key(a));}return [...annotations].map(a=>({rule_id:a.rule_id,line:a.line,status:a.status})).sort((a,b)=>key(a).localeCompare(key(b)));}
function validateCoverage(value){if(!Array.isArray(value)||!value.length||value.some(v=>!ids.has(v))||new Set(value).size!==value.length)throw Error('reviewed_rule_ids must be a nonempty unique list of known rules');return [...value].sort();}
function reviewPath(base,id,reviewer){return path.join(base,'reviews',id,`${reviewer}.json`);}
function readReview(base,id,reviewer,item){const r=load(safe(base,path.join('reviews',id,`${reviewer}.json`)));if(r.schema_version!=='1.4-review'||r.case_id!==id||r.reviewer!==reviewer||r.snapshot_sha256!==item.sha256||typeof r.guideline_version!=='string'||!r.guideline_version.trim())throw Error('Review metadata mismatch');const coverage=validateCoverage(r.reviewed_rule_ids);const annotations=validateAnnotations(r.annotations,fs.readFileSync(validateSnapshot(base,item)));if(JSON.stringify(coverage)!==JSON.stringify(r.reviewed_rule_ids)||JSON.stringify(annotations)!==JSON.stringify(r.annotations)||annotations.some(a=>!coverage.includes(a.rule_id)))throw Error('Review content mismatch');return r;}
/** Independent submissions are immutable. No access to the other review is needed to submit. */
export function submitReview({dataset,id,reviewer,file,guidelineVersion}){
 if(!reviewerPattern.test(reviewer??''))throw Error('Invalid reviewer ID');
 if(typeof guidelineVersion!=='string'||!guidelineVersion.trim())throw Error('Guideline version is required');
 const {base,manifest}=baseAndManifest(dataset),item=caseFor(manifest,id),source=fs.readFileSync(validateSnapshot(base,item));
 const input=load(file),coverage=validateCoverage(input.reviewed_rule_ids),annotations=validateAnnotations(input.annotations,source);
 if(annotations.some(a=>!coverage.includes(a.rule_id)))throw Error('Annotation outside reviewed rule coverage');
 const dest=reviewPath(base,id,reviewer);fs.mkdirSync(path.dirname(dest),{recursive:true});
 const review={schema_version:'1.4-review',case_id:id,reviewer,guideline_version:guidelineVersion,snapshot_sha256:item.sha256,reviewed_rule_ids:coverage,annotations};
 save(dest,review);return {case_id:id,reviewer,review_file:path.relative(base,dest),annotations:annotations.length,immutable:true};
}
export function compareReviews({dataset,id,reviewers}){
 const {base,manifest}=baseAndManifest(dataset),item=caseFor(manifest,id);validateSnapshot(base,item);
 if(!Array.isArray(reviewers)||reviewers.length!==2||reviewers[0]===reviewers[1]||reviewers.some(r=>!reviewerPattern.test(r)))throw Error('Exactly two distinct reviewer IDs required');
 const [a,b]=reviewers.map(r=>readReview(base,id,r,item));
 if(a.guideline_version!==b.guideline_version)throw Error('Reviewer guideline versions differ');
 if(JSON.stringify(a.reviewed_rule_ids)!==JSON.stringify(b.reviewed_rule_ids))throw Error('Reviewer rule coverage differs');
 const aa=new Set(a.annotations.map(key)),bb=new Set(b.annotations.map(key));
 const agreement=[...aa].filter(k=>bb.has(k)).sort(),disagreements=[...new Set([...aa,...bb])].filter(k=>!aa.has(k)||!bb.has(k)).sort();
 return {case_id:id,snapshot_sha256:item.sha256,reviewers,reviewed_rule_ids:a.reviewed_rule_ids,guideline_version:a.guideline_version,agreement,disagreements,agreement_count:agreement.length,disagreement_count:disagreements.length,warning:'Agreement is on explicitly annotated findings; unannotated lines are not independently verified negatives.'};
}
/** A third reviewer must explicitly decide every disputed annotation, even when there are none. */
export function adjudicate({dataset,id,reviewers,adjudicator,file}){
 if(!reviewerPattern.test(adjudicator??'')||reviewers.includes(adjudicator))throw Error('Adjudicator must be distinct from reviewers');
 const comparison=compareReviews({dataset,id,reviewers}),input=load(file);
 if(!Array.isArray(input.accepted_disagreements)||new Set(input.accepted_disagreements).size!==input.accepted_disagreements.length||input.accepted_disagreements.some(k=>!comparison.disagreements.includes(k)))throw Error('Invalid adjudication decisions');
 if(!Array.isArray(input.rejected_disagreements)||new Set(input.rejected_disagreements).size!==input.rejected_disagreements.length||input.rejected_disagreements.some(k=>!comparison.disagreements.includes(k)))throw Error('Invalid rejected decisions');
 const decided=[...input.accepted_disagreements,...input.rejected_disagreements];if(decided.length!==comparison.disagreements.length||new Set(decided).size!==decided.length)throw Error('Every disagreement requires one explicit decision');
 if(typeof input.rationale!=='string'||input.rationale.trim().length<10)throw Error('Adjudication rationale must be at least 10 characters');
 const annotations=[...comparison.agreement,...input.accepted_disagreements].sort().map(k=>{const [rule_id,line,status]=k.split(':');return {rule_id,line:Number(line),status};});
 const {base}=baseAndManifest(dataset),dest=path.join(base,'adjudications',`${id}.json`);fs.mkdirSync(path.dirname(dest),{recursive:true});
 const record={schema_version:'1.4-adjudication',...comparison,adjudicator,rationale:input.rationale,accepted_disagreements:[...input.accepted_disagreements].sort(),rejected_disagreements:[...input.rejected_disagreements].sort(),annotations};
 save(dest,record);return {case_id:id,adjudication_file:path.relative(base,dest),accepted:annotations.length,disagreements_resolved:comparison.disagreements.length};
}
export function exportReviewed({dataset,out}){
 // Fail closed: no partial or stale review set may enter the curated benchmark.
 const audit=auditReviewDataset(dataset);
 if(audit.status!=='READY_FOR_EXPORT'||audit.counts.total===0)throw Error(`Review audit BLOCK: ${audit.cases.filter(c=>c.status==='BLOCK').map(c=>`${c.id}(${c.issues.join(',')})`).join('; ')||'empty dataset'}`);
 const {base,manifest}=baseAndManifest(dataset),cases=[];
 for(const item of manifest.cases){
  validateSnapshot(base,item);
  const relative=path.join('adjudications',`${item.id}.json`);
  if(!fs.existsSync(path.join(base,relative)))continue;
  const a=load(safe(base,relative));
  const comparison=compareReviews({dataset,id:item.id,reviewers:a.reviewers});
  if(a.snapshot_sha256!==item.sha256||JSON.stringify(a.disagreements)!==JSON.stringify(comparison.disagreements)||JSON.stringify(a.agreement)!==JSON.stringify(comparison.agreement)||a.guideline_version!==comparison.guideline_version)throw Error(`Stale adjudication: ${item.id}`);
  if(!Array.isArray(a.annotations)||!Array.isArray(a.accepted_disagreements)||!Array.isArray(a.rejected_disagreements))throw Error('Malformed adjudication');
  const decisions=[...a.accepted_disagreements,...a.rejected_disagreements];if(decisions.length!==comparison.disagreements.length||new Set(decisions).size!==decisions.length||decisions.some(k=>!comparison.disagreements.includes(k)))throw Error('Adjudication decisions are inconsistent');
  const expected=[...a.agreement,...a.accepted_disagreements].sort();if(JSON.stringify(a.annotations.map(key).sort())!==JSON.stringify(expected))throw Error('Adjudication annotations altered');
  cases.push({id:item.id,file:item.file,technology:item.technology,origin:item.origin,sha256:item.sha256,provenance:item.provenance,review:{method:'independent-double',reviewers:a.reviewers,guideline_version:a.guideline_version},reviewed_rule_ids:a.reviewed_rule_ids,annotations:a.annotations});
 }
 if(!cases.length)throw Error('No adjudicated cases available');
 const result={schema_version:'1.2',description:'Adjudicated source-pattern labels; not a representative UX benchmark',cases};
 // Export into the dataset root only: relative snapshot paths must remain valid.
 const destination=path.resolve(out);if(path.dirname(destination)!==base)throw Error('Export destination must be inside dataset root');
 const tmp=path.join(base,`.curated-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`);
 try{fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,destination);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return {manifest:destination,exported:cases.length,excluded_pending:manifest.cases.length-cases.length,limitations:['Only explicitly reviewed rules are covered; unannotated findings outside coverage are not reliable negatives.','Independent review is procedural and cannot be cryptographically proven by reviewer IDs.']};
}
