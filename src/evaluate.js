import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {audit} from './audit.js';
import {rules} from './rules.js';
import {validateProvenance} from './evaluation-protocol.js';

const ruleIds=new Set(rules.map(r=>r.id));
const statuses=new Set(['FAIL','UNVERIFIED']);
function safeFile(base,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Case file must be a relative path');
 const resolved=path.resolve(base,relative);
 if(resolved===base||!resolved.startsWith(base+path.sep))throw Error('Case file escapes dataset directory');
 const stat=fs.lstatSync(resolved);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Case file must be a regular file, not a symlink');
 return resolved;
}
function validateAnnotation(annotation,seen){
 if(!annotation||!ruleIds.has(annotation.rule_id)||!Number.isInteger(annotation.line)||annotation.line<1||!statuses.has(annotation.status))throw Error('Invalid annotation: expected rule_id, positive line, FAIL|UNVERIFIED status');
 const key=`${annotation.rule_id}:${annotation.line}:${annotation.status}`;
 if(seen.has(key))throw Error(`Duplicate annotation ${key}`);
 seen.add(key);
}
function rate(n,d){return d===0?null:n/d;}
/** Source-pattern evaluation on manually labeled, line-level annotations. Not a UX or WCAG compliance score. */
export function evaluate(manifestPath){
 const base=path.dirname(path.resolve(manifestPath));
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(!['1.1','1.2'].includes(manifest.schema_version)||!Array.isArray(manifest.cases)||manifest.cases.length===0)throw Error('Dataset requires schema_version 1.1 or 1.2 and nonempty cases');
 const cases=[];const totals={tp:0,fp:0,fn:0,uncertain_matched:0,unexpected_unverified:0};
 const perRule=new Map();const seenCases=new Set();const strata=new Map();
 for(const item of manifest.cases){
  if(!item||!Array.isArray(item.annotations)||typeof item.file!=='string')throw Error('Invalid dataset case');
  const file=safeFile(base,item.file);
  const provenance=validateProvenance(manifest,item,file,seenCases);
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).length;
  const seen=new Set();
  for(const a of item.annotations){validateAnnotation(a,seen);if(a.line>lines)throw Error(`Annotation beyond end of file: ${item.file}:${a.line}`);}
  const report=audit(file);
  if(report.diagnostics.length)throw Error(`Analyzer diagnostic in ${item.file}: ${JSON.stringify(report.diagnostics)}`);
  const covered=item.reviewed_rule_ids===undefined?null:new Set(item.reviewed_rule_ids);
  if(covered&&(!Array.isArray(item.reviewed_rule_ids)||!item.reviewed_rule_ids.length||covered.size!==item.reviewed_rule_ids.length||[...covered].some(id=>!ruleIds.has(id))))throw Error('Invalid reviewed_rule_ids');
  if(covered&&item.annotations.some(a=>!covered.has(a.rule_id)))throw Error('Annotation outside reviewed rule coverage');
  const actual=report.findings.filter(f=>!covered||covered.has(f.rule_id)).map(f=>({rule_id:f.rule_id,line:f.line,status:f.status}));
  const remaining=[...actual];const tp=[],fn=[],uncertain=[];
  for(const expected of item.annotations){
   const idx=remaining.findIndex(a=>a.rule_id===expected.rule_id&&a.line===expected.line&&a.status===expected.status);
   if(idx>=0){const matched=remaining.splice(idx,1)[0];if(expected.status==='FAIL')tp.push(matched);else uncertain.push(matched);}
   else if(expected.status==='FAIL')fn.push(expected);
   else fn.push(expected);
  }
  const fp=remaining.filter(a=>a.status==='FAIL');
  const unexpectedUnverified=remaining.filter(a=>a.status==='UNVERIFIED');
  for(const [type,items] of [['tp',tp],['fp',fp],['fn',fn],['uncertain_matched',uncertain],['unexpected_unverified',unexpectedUnverified]]){
   totals[type]+=items.length;
   for(const x of items){if(!perRule.has(x.rule_id))perRule.set(x.rule_id,{tp:0,fp:0,fn:0,uncertain_matched:0,unexpected_unverified:0});perRule.get(x.rule_id)[type]++;}
  }
  if(provenance){const key=`${provenance.origin}/${provenance.technology}`;if(!strata.has(key))strata.set(key,{cases:0,tp:0,fp:0,fn:0,uncertain_matched:0,unexpected_unverified:0});const group=strata.get(key);group.cases++;for(const [type,items] of [['tp',tp],['fp',fp],['fn',fn],['uncertain_matched',uncertain],['unexpected_unverified',unexpectedUnverified]])group[type]+=items.length;}
  const annotation_sha256=crypto.createHash('sha256').update(JSON.stringify([...item.annotations].sort((a,b)=>a.rule_id.localeCompare(b.rule_id)||a.line-b.line||a.status.localeCompare(b.status)))).digest('hex');
  cases.push({...provenance,annotation_sha256,file:item.file,reviewed_rule_ids:item.reviewed_rule_ids??null,counts:{tp:tp.length,fp:fp.length,fn:fn.length,uncertain_matched:uncertain.length,unexpected_unverified:unexpectedUnverified.length},false_positives:fp,false_negatives:fn,unexpected_unverified:unexpectedUnverified});
 }
 return {schema_version:manifest.schema_version,dataset:manifest.description??'Unspecified curated dataset',scope:'line-level, manually annotated source-pattern detection; no claims of real-world representativeness',cases,counts:totals,precision:rate(totals.tp,totals.tp+totals.fp),recall:rate(totals.tp,totals.tp+totals.fn),per_rule:Object.fromEntries([...perRule].sort(([a],[b])=>a.localeCompare(b))),strata:Object.fromEntries([...strata].map(([key,v])=>[key,{...v,precision:rate(v.tp,v.tp+v.fp),recall:rate(v.tp,v.tp+v.fn)}])),limitations:['UNVERIFIED annotations are evaluated separately from confirmed source-pattern precision and recall.','A missing expected UNVERIFIED finding counts as an annotation mismatch (fn), not a proven accessibility defect.','Curated fixture scores do not measure production accuracy, actual UX outcomes, or WCAG conformance.','Cases with reviewed_rule_ids are evaluated only for those explicitly covered rules; this is not exhaustive negative labeling.']};
}
