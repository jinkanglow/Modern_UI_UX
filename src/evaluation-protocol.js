import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SHA256=/^[a-f0-9]{64}$/i;
const TECH=new Set(['html','react','vue','svelte','angular','other']);
export function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
export function validateProvenance(manifest,item,file,seenCases){
 if(manifest.schema_version!=='1.2')return null;
 if(typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(item.id)||seenCases.has(item.id))throw Error('Each v1.2 case requires a unique stable id');
 seenCases.add(item.id);
 if(!TECH.has(item.technology))throw Error(`Invalid technology for ${item.id}`);
 if(!['synthetic','real-project'].includes(item.origin))throw Error(`Invalid origin for ${item.id}`);
 if(typeof item.sha256!=='string'||!SHA256.test(item.sha256))throw Error(`Missing SHA-256 for ${item.id}`);
 const actual=sha256(file);
 if(actual.toLowerCase()!==item.sha256.toLowerCase())throw Error(`Content hash mismatch for ${item.id}; dataset is not frozen`);
 if(item.origin==='real-project'){
  const p=item.provenance;
  if(!p||typeof p.repository!=='string'||!/^https:\/\/[^\s]+$/.test(p.repository)||typeof p.revision!=='string'||!/^[a-f0-9]{7,64}$/i.test(p.revision)||typeof p.source_path!=='string'||!p.source_path||path.isAbsolute(p.source_path)||p.source_path.split(/[\\/]/).includes('..'))throw Error(`Real-project case ${item.id} needs repository URL, pinned commit and source_path`);
 }
 const r=item.review;
 if(!r||!['single','independent-double'].includes(r.method)||typeof r.guideline_version!=='string'||!r.guideline_version.trim()||!Array.isArray(r.reviewers)||r.reviewers.length<(r.method==='independent-double'?2:1)||new Set(r.reviewers).size!==r.reviewers.length||r.reviewers.some(x=>typeof x!=='string'||!x.trim()))throw Error(`Case ${item.id} requires reviewer IDs, guideline version and review method`);
 return {id:item.id,technology:item.technology,origin:item.origin,sha256:actual,review_method:r.method,reviewers:r.reviewers.length};
}
export function compareEvaluation(current,baseline){
 if(!baseline||!baseline.counts||!baseline.per_rule||!Array.isArray(baseline.cases))throw Error('Invalid evaluation baseline');
 const baselineCases=new Map(baseline.cases.map(c=>[c.id??c.file,c]));
 const currentCases=new Map(current.cases.map(c=>[c.id??c.file,c]));
 const added=[...currentCases.keys()].filter(k=>!baselineCases.has(k));
 const removed=[...baselineCases.keys()].filter(k=>!currentCases.has(k));
 const changed=[...currentCases.keys()].filter(k=>{if(!baselineCases.has(k))return false;const a=currentCases.get(k),b=baselineCases.get(k);return (a.sha256&&b.sha256&&a.sha256!==b.sha256)||(a.annotation_sha256&&b.annotation_sha256&&a.annotation_sha256!==b.annotation_sha256)||(a.review_method&&b.review_method&&a.review_method!==b.review_method);});
 const delta={};for(const k of ['tp','fp','fn','uncertain_matched','unexpected_unverified'])delta[k]=(current.counts[k]??0)-(baseline.counts[k]??0);
 return {comparable:added.length===0&&removed.length===0&&changed.length===0&&current.schema_version===baseline.schema_version,added,removed,changed,delta,precision_delta:current.precision===null||baseline.precision===null?null:current.precision-baseline.precision,recall_delta:current.recall===null||baseline.recall===null?null:current.recall-baseline.recall,warning:'Deltas are not an accuracy improvement claim unless the dataset, annotations, and evaluation protocol are unchanged.'};
}
