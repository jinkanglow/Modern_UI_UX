/** Offline source provenance verification against a local Git object database.
 * Does not authenticate repository ownership, reviewers, or remote hosting.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const hex=/^[0-9a-f]{7,40}$/i;
function git(cwd,args,maxBuffer=2*1024*1024){return spawnSync('git',args,{cwd,encoding:null,maxBuffer,timeout:10000});}
function validPath(p){return typeof p==='string'&&p.length>0&&!p.startsWith('-')&&!path.isAbsolute(p)&&!p.includes('\\')&&!p.includes('\0')&&!p.split('/').some(s=>s==='..'||s==='.'||!s);}
export function verifyProvenance(dataset,checkout){
 const base=path.resolve(dataset),repo=path.resolve(checkout);
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Expected v1.3-draft dataset');
 const root=git(repo,['rev-parse','--show-toplevel']);
 if(root.error||root.status!==0||path.resolve(root.stdout.toString().trim())!==repo)throw Error('Checkout must be a local Git repository root');
 const results=[];const seen=new Set();
 for(const c of manifest.cases){
  if(!c||typeof c.id!=='string'||!c.id||seen.has(c.id))throw Error('Invalid or duplicate case ID');seen.add(c.id);
  const p=c.provenance||{};
  if(!hex.test(p.revision??'')||!validPath(p.source_path)||typeof c.file!=='string'||!validPath(c.file)||!/^https:\/\/[^\s]+$/.test(p.repository??''))throw Error(`Invalid provenance metadata for ${c.id}`);
  const snapshot=path.resolve(base,c.file);
  if(!snapshot.startsWith(base+path.sep))throw Error('Snapshot escapes dataset');
  const stat=fs.lstatSync(snapshot);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('Invalid snapshot file');
  const actual=digest(fs.readFileSync(snapshot));
  if(actual!==c.sha256){results.push({id:c.id,status:'MISMATCH',reason:'SNAPSHOT_HASH_MISMATCH'});continue;}
  const commit=git(repo,['rev-parse','--verify',`${p.revision}^{commit}`]);
  if(commit.error||commit.status!==0){results.push({id:c.id,status:'UNVERIFIED',reason:'COMMIT_NOT_AVAILABLE'});continue;}
  const resolved=commit.stdout.toString().trim();
  const obj=git(repo,['show',`${resolved}:${p.source_path}`]);
  if(obj.error||obj.status!==0){results.push({id:c.id,status:'MISMATCH',reason:'SOURCE_PATH_NOT_FOUND'});continue;}
  results.push({id:c.id,status:digest(obj.stdout)===actual?'VERIFIED':'MISMATCH',reason:digest(obj.stdout)===actual?'PINNED_GIT_BLOB_MATCH':'GIT_BLOB_MISMATCH',commit:resolved});
 }
 const counts={total:results.length,verified:results.filter(x=>x.status==='VERIFIED').length,mismatch:results.filter(x=>x.status==='MISMATCH').length,unverified:results.filter(x=>x.status==='UNVERIFIED').length};
 return {schema_version:'1.0',status:counts.total>0&&counts.verified===counts.total?'LOCAL_BLOBS_MATCH':'NOT_VERIFIED',counts,cases:results,limitations:['Local Git object matching does not authenticate a remote host, repository owner or source license.','No network fetching is performed; missing commits remain unverified.','Reviewer independence and UX correctness are not established by Git provenance.']};
}
