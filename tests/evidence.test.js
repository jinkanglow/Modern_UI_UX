import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {addSnapshot} from '../src/dataset.js';
import {attachEvidence,checkEvidence} from '../src/evidence.js';

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-evidence-'));
 const source=path.join(dir,'source.html');fs.writeFileSync(source,'<button>Submit</button>\n');
 const dataset=path.join(dir,'dataset');
 addSnapshot({dataset,source,id:'case1',technology:'html',repository:'https://github.com/example/project',revision:'abcdef1234567',sourcePath:'src/source.html'});
 const artifact=path.join(dir,'screen.png');fs.writeFileSync(artifact,Buffer.from('fake-png-test-data'));
 return {dir,dataset,artifact,source};
}
test('attach, verify and detect modified evidence',()=>{
 const f=fixture();try{
  const record=attachEvidence({datasetDir:f.dataset,caseId:'case1',evidenceId:'shot01',file:f.artifact,kind:'screenshot',scenario:'save-error',step:2,location:{line:1,column:1}});
  assert.equal(record.verification,'INTEGRITY_ONLY');
  assert.equal(checkEvidence(f.dataset).counts.intact,1);
  fs.appendFileSync(path.join(f.dataset,record.artifact),'tamper');
  assert.equal(checkEvidence(f.dataset).counts.invalid,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('evidence is immutable and rejects invalid source positions',()=>{
 const f=fixture();try{
  const args={datasetDir:f.dataset,caseId:'case1',evidenceId:'note01',file:f.artifact,kind:'manual-note',location:{line:1}};
  attachEvidence(args);
  assert.throws(()=>attachEvidence(args),/already exists/);
  assert.throws(()=>attachEvidence({...args,evidenceId:'note02',location:{line:100}}),/Invalid source line/);
  assert.throws(()=>attachEvidence({...args,evidenceId:'note03',kind:'unknown'}),/Unsupported evidence kind/);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('detect source mutation and path traversal in evidence records',()=>{
 const f=fixture();try{
  const record=attachEvidence({datasetDir:f.dataset,caseId:'case1',evidenceId:'shot02',file:f.artifact,kind:'screenshot'});
  const recordFile=path.join(f.dataset,'evidence','case1','shot02.json');
  const altered={...record,artifact:'../../outside'};fs.writeFileSync(recordFile,JSON.stringify(altered));
  assert.equal(checkEvidence(f.dataset).counts.invalid,1);
  fs.writeFileSync(recordFile,JSON.stringify(record));
  fs.appendFileSync(path.join(f.dataset,'snapshots','case1.html'),'<!-- changed -->');
  assert.equal(checkEvidence(f.dataset).counts.invalid,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
