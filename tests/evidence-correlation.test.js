import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {addSnapshot} from '../src/dataset.js';
import {attachEvidence} from '../src/evidence.js';
import {correlateEvidence,checkCorrelations} from '../src/evidence-correlation.js';
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux-correlation-'));
 const source=path.join(dir,'source.html');fs.writeFileSync(source,'<button>Save</button>\n');
 const dataset=path.join(dir,'dataset');
 addSnapshot({dataset,source,id:'case1',technology:'html',repository:'https://github.com/example/project',revision:'abcdef1234567',sourcePath:'src/source.html'});
 const screenshot=path.join(dir,'failure.png');fs.writeFileSync(screenshot,Buffer.from('fixture-only-not-a-real-png'));
 attachEvidence({datasetDir:dataset,caseId:'case1',evidenceId:'shot01',file:screenshot,kind:'screenshot',scenario:'submit-error',step:2,location:{line:1}});
 const reportFile=path.join(dir,'report.json');
 const report={schema_version:'1.0',mode:'interaction',scenarios:[{id:'submit-error',status:'FAIL'}],findings:[{rule_id:'FLOW-ASSERTION_FAILED',scenario:'submit-error',step:2,status:'FAIL',selector:'#status',evidence:'Expected error text'}]};
 fs.writeFileSync(reportFile,JSON.stringify(report));
 const args={datasetDir:dataset,caseId:'case1',evidenceId:'shot01',reportFile,scenario:'submit-error',step:2,ruleId:'FLOW-ASSERTION_FAILED'};
 return {dir,dataset,reportFile,report,args};
}
const cleanup=f=>fs.rmSync(f.dir,{recursive:true,force:true});
test('correlation verifies exact failed finding and evidence hash',()=>{const f=setup();try{
 const result=correlateEvidence(f.args);
 assert.equal(result.verification,'REPORT_AND_ARTIFACT_INTEGRITY');
 assert.equal(checkCorrelations(f.dataset,{reportFile:f.reportFile}).counts.correlated,1);
 assert.equal(checkCorrelations(f.dataset).counts.integrity_only,1);
 assert.throws(()=>correlateEvidence(f.args),/EEXIST/);
}finally{cleanup(f);}});
test('rejects wrong step, scenario, rule and successful findings',()=>{const f=setup();try{
 assert.throws(()=>correlateEvidence({...f.args,step:3}),/mismatch/);
 assert.throws(()=>correlateEvidence({...f.args,ruleId:'FLOW-ACTION_FAILED'}),/matching failed/);
 f.report.findings[0].status='PASS';fs.writeFileSync(f.reportFile,JSON.stringify(f.report));
 assert.throws(()=>correlateEvidence(f.args),/matching failed/);
}finally{cleanup(f);}});
test('modified report and modified screenshot invalidate correlation',()=>{const f=setup();try{
 correlateEvidence(f.args);
 fs.appendFileSync(f.reportFile,' ');
 assert.equal(checkCorrelations(f.dataset,{reportFile:f.reportFile}).counts.invalid,1);
 fs.writeFileSync(f.reportFile,JSON.stringify(f.report));
 const payload=path.join(f.dataset,'evidence','case1','shot01.bin');fs.appendFileSync(payload,'tamper');
 assert.equal(checkCorrelations(f.dataset).counts.invalid,1);
}finally{cleanup(f);}});
test('correlation record does not copy sensitive report strings',()=>{const f=setup();try{
 f.report.target='https://private.example/?token=secret';fs.writeFileSync(f.reportFile,JSON.stringify(f.report));
 correlateEvidence(f.args);
 const record=fs.readFileSync(path.join(f.dataset,'evidence','case1','shot01.correlation.json'),'utf8');
 assert.equal(record.includes('secret'),false);
 assert.equal(record.includes('Expected error text'),false);
}finally{cleanup(f);}});
