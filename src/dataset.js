import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const extensions=new Set(['.html','.htm','.jsx','.tsx','.js','.ts','.css','.vue','.svelte']);
const technologies=new Set(['html','react','vue','svelte','angular','other']);
const SHA=/^[a-f0-9]{7,64}$/i;
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
function hash(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Input must be a regular file, not a symlink');return stat;}
function inside(base,relative){if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Invalid relative snapshot path');const p=path.resolve(base,relative);if(!p.startsWith(base+path.sep))throw Error('Snapshot path escapes dataset');return p;}
function sourcePathValid(p){return typeof p==='string'&&p.length>0&&!path.isAbsolute(p)&&!p.split(/[\\/]/).includes('..')&&!p.includes('\0');}
/** Imports a local, independently obtained source snapshot. No network fetching or automatic labels. */
export function addSnapshot({dataset,source,id,technology,repository,revision,sourcePath}){
 if(!idPattern.test(id??''))throw Error('Invalid case id');
 if(!technologies.has(technology))throw Error('Invalid technology');
 if(typeof repository!=='string'||!/^https:\/\/[^\s]+$/.test(repository))throw Error('Repository must be an HTTPS URL');
 if(!SHA.test(revision??''))throw Error('Revision must be a pinned hexadecimal commit');
 if(!sourcePathValid(sourcePath))throw Error('Invalid source path');
 const ext=path.extname(sourcePath).toLowerCase();if(!extensions.has(ext))throw Error('Unsupported source extension');
 const absSource=path.resolve(source);const stat=regular(absSource);
 if(stat.size>1024*1024)throw Error('Snapshot exceeds 1 MiB safety limit');
 const data=fs.readFileSync(absSource),sha256=hash(data);
 const base=path.resolve(dataset),manifestPath=path.join(base,'manifest.json');
 fs.mkdirSync(base,{recursive:true});
 const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{schema_version:'1.3-draft',description:'Unreviewed imported source snapshots; not an accuracy benchmark',cases:[]};
 if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Dataset is not a v1.3 draft');
 if(manifest.cases.some(c=>c.id===id))throw Error('Duplicate case id');
 const filename=`${id}${ext}`,relative=`snapshots/${filename}`,destination=inside(base,relative);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 if(fs.existsSync(destination))throw Error('Snapshot already exists');
 fs.writeFileSync(destination,data,{flag:'wx'});
 manifest.cases.push({id,file:relative,technology,origin:'real-project',sha256,provenance:{repository,revision,source_path:sourcePath},review:{status:'PENDING',method:null,reviewers:[],guideline_version:null},annotations:[]});
 try{fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}catch(e){fs.rmSync(destination,{force:true});throw e;}
 return {id,file:relative,sha256,bytes:data.length,review_status:'PENDING',manifest:manifestPath};
}
export function checkSnapshots(dataset){
 const base=path.resolve(dataset),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Expected v1.3 draft manifest');
 const seen=new Set(),results=[];
 for(const c of manifest.cases){
  if(!idPattern.test(c.id??'')||seen.has(c.id))throw Error('Invalid or duplicate case id');seen.add(c.id);
  const file=inside(base,c.file);regular(file);
  const actual=hash(fs.readFileSync(file));const intact=actual===c.sha256;
  results.push({id:c.id,technology:c.technology,origin:c.origin,integrity:intact?'PASS':'FAIL',review_status:c.review?.status??'UNKNOWN',sha256:actual});
 }
 return {schema_version:'1.3',cases:results,counts:{total:results.length,intact:results.filter(r=>r.integrity==='PASS').length,pending_review:results.filter(r=>r.review_status==='PENDING').length},benchmark_ready:false,limitations:['A matching hash verifies snapshot integrity, not provenance authenticity.','Imported snapshots are unreviewed and excluded from precision/recall calculations.','Repository URLs and revisions are supplied metadata, not independently authenticated.']};
}
