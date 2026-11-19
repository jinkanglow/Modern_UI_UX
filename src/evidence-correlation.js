import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {checkEvidence} from './evidence.js';

const idPattern=/^[A-Za-z0-9_-]{2,80}$/;
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readRegular(file,max=20*1024*1024){
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('Expected regular, non-symlink file within size limit');
 return fs.readFileSync(file);
}
function loadDataset(root,caseId,evidenceId){
 if(!idPattern.test(caseId??'')||!idPattern.test(evidenceId??''))throw Error('Invalid case/evidence ID');
 const base=path.resolve(root);
 const manifest=JSON.parse(readRegular(path.join(base,'manifest.json')).toString());
 if(manifest.schema_version!=='1.3-draft'||!manifest.cases?.some(c=>c.id===caseId))throw Error('Unknown dataset case');
 const evidenceFile=path.join(base,'evidence',caseId,`${evidenceId}.json`);
 const evidence=JSON.parse(readRegular(evidenceFile).toString());
 const check=checkEvidence(base).entries.find(x=>x.case_id===caseId&&x.evidence_id===evidenceId);
 if(check?.status!=='INTACT')throw Error('Evidence integrity check failed');
 return {base,evidence};
}
function reportFinding(report,scenario,step,ruleId){
 if(!report||!Array.isArray(report.findings))throw Error('Report requires findings array');
 const matches=report.findings.filter(f=>f.scenario===scenario&&f.step===step&&f.rule_id===ruleId&&f.status==='FAIL');
 if(matches.length!==1)throw Error('Expected exactly one matching failed browser finding');
 if(!report.scenarios?.some(s=>s.id===scenario&&s.status==='FAIL'))throw Error('Scenario is not marked failed');
 return matches[0];
}
/** Correlates caller-supplied report and immutable evidence, without claiming DOM-to-source mapping. */
export function correlateEvidence({datasetDir,caseId,evidenceId,reportFile,scenario,step,ruleId}){
 if(!idPattern.test(scenario??'')||!/^FLOW-[A-Z_]+$/.test(ruleId??'')||!Number.isInteger(step)||step<0)throw Error('Invalid scenario, step or browser rule');
 const {base,evidence}=loadDataset(datasetDir,caseId,evidenceId);
 if(evidence.scenario!==scenario||evidence.step!==step)throw Error('Evidence scenario/step mismatch');
 const bytes=readRegular(path.resolve(reportFile));
 const report=JSON.parse(bytes.toString('utf8'));
 if(report.mode!=='interaction'||!['0.7','0.8','0.9','1.0'].includes(report.schema_version))throw Error('Expected interaction report');
 const finding=reportFinding(report,scenario,step,ruleId);
 const relative=path.join('evidence',caseId,`${evidenceId}.correlation.json`);
 const destination=path.join(base,relative);
 const record={schema_version:'1.6-correlation',case_id:caseId,evidence_id:evidenceId,scenario,step,rule_id:ruleId,report_sha256:sha256(bytes),finding_sha256:sha256(Buffer.from(JSON.stringify({rule_id:finding.rule_id,scenario:finding.scenario,step:finding.step,status:finding.status,selector:finding.selector??null,evidence:finding.evidence??null}))),evidence_sha256:evidence.sha256,snapshot_sha256:evidence.snapshot_sha256,verification:'REPORT_AND_ARTIFACT_INTEGRITY',limitations:['The supplied report is not authenticated as a real browser execution.','The source position is caller supplied; no DOM-to-source mapping is established.','Raw report text and URLs are intentionally not copied into this record.']};
 fs.writeFileSync(destination,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 return record;
}
/** Checks saved links against current evidence and optionally their original report. */
export function checkCorrelations(datasetDir,{reportFile}={}){
 const base=path.resolve(datasetDir),manifest=JSON.parse(readRegular(path.join(base,'manifest.json')).toString());
 if(manifest.schema_version!=='1.3-draft'||!Array.isArray(manifest.cases))throw Error('Invalid dataset');
 const evidenceStatus=checkEvidence(base).entries;
 const reportBytes=reportFile?readRegular(path.resolve(reportFile)):null;
 const report=reportBytes?JSON.parse(reportBytes.toString('utf8')):null;
 const entries=[];
 for(const item of manifest.cases){
  if(!idPattern.test(item.id??''))throw Error('Invalid case ID');
  const folder=path.join(base,'evidence',item.id);
  if(!fs.existsSync(folder))continue;
  for(const filename of fs.readdirSync(folder).filter(n=>n.endsWith('.correlation.json'))){
   const id=filename.slice(0,-'.correlation.json'.length);
   try{
    if(!idPattern.test(id))throw Error('Invalid evidence ID');
    const record=JSON.parse(readRegular(path.join(folder,filename)).toString());
    if(record.schema_version!=='1.6-correlation'||record.case_id!==item.id||record.evidence_id!==id||record.snapshot_sha256!==item.sha256)throw Error('Correlation metadata mismatch');
    if(!evidenceStatus.some(e=>e.case_id===item.id&&e.evidence_id===id&&e.status==='INTACT'))throw Error('Underlying evidence is not intact');
    const evidence=JSON.parse(readRegular(path.join(folder,`${id}.json`)).toString());
    if(evidence.sha256!==record.evidence_sha256||evidence.scenario!==record.scenario||evidence.step!==record.step)throw Error('Evidence association mismatch');
    if(reportBytes){
     if(sha256(reportBytes)!==record.report_sha256)throw Error('Report hash mismatch');
     const f=reportFinding(report,record.scenario,record.step,record.rule_id);
     const digest=sha256(Buffer.from(JSON.stringify({rule_id:f.rule_id,scenario:f.scenario,step:f.step,status:f.status,selector:f.selector??null,evidence:f.evidence??null})));
     if(digest!==record.finding_sha256)throw Error('Finding changed');
    }
    entries.push({case_id:item.id,evidence_id:id,status:reportBytes?'CORRELATED':'INTEGRITY_ONLY'});
   }catch(e){entries.push({case_id:item.id,evidence_id:id,status:'INVALID',reason:e.message});}
  }
 }
 return {schema_version:'1.6-correlation-check',entries,counts:{total:entries.length,invalid:entries.filter(e=>e.status==='INVALID').length,correlated:entries.filter(e=>e.status==='CORRELATED').length,integrity_only:entries.filter(e=>e.status==='INTEGRITY_ONLY').length},limitations:['Correlation is not independent proof of browser authenticity or source-to-DOM mapping.','Without --report only stored evidence integrity is checked.']};
}
