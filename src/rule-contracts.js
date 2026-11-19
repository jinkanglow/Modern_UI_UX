import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rules} from './rules.js';

const contractDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../rules/contracts');
const taskVocabulary=new Set(['form','navigation','accessibility','content','mobile','keyboard','security','motion','design-system','feedback','destructive','recovery']);
const caseNames=['trigger','counterexample','boundary'];

export function validateRuleContract(c){
 if(!c||c.schema_version!=='1.0'||!rules.some(r=>r.id===c.id))throw Error('Unknown rule contract or schema');
 if(typeof c.mechanism!=='string'||c.mechanism.length<15)throw Error(`${c.id}: mechanism missing`);
 if(!Array.isArray(c.tasks)||!c.tasks.length||new Set(c.tasks).size!==c.tasks.length||c.tasks.some(t=>!taskVocabulary.has(t)))throw Error(`${c.id}: invalid task tags`);
 if(c.detector?.type!=='existing_static_audit'||c.detector.rule_id!==c.id)throw Error(`${c.id}: detector mismatch`);
 if(c.evidence?.kind!=='source_pattern'||c.decision?.runtime_claim_allowed!==false)throw Error(`${c.id}: ungrounded evidence claim`);
 if(!Array.isArray(c.cases)||c.cases.length!==3||c.cases.some((x,i)=>x.name!==caseNames[i]||!['html','css','js','jsx','tsx','ts'].includes(x.extension)||typeof x.source!=='string'||typeof x.expect_detected!=='boolean'))throw Error(`${c.id}: trigger, counterexample, boundary required`);
 if(c.cases[0].expect_detected!==true||c.cases[1].expect_detected!==false)throw Error(`${c.id}: invalid case expectations`);
 if(!c.remediation?.policy||!c.verification?.method)throw Error(`${c.id}: missing remediation or verification`);
 return c;
}
export function loadRuleContracts(dir=contractDir){
 const contracts=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>validateRuleContract(JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))));
 const ids=contracts.map(c=>c.id);
 if(new Set(ids).size!==ids.length)throw Error('Duplicate rule contract');
 const missing=rules.filter(r=>!ids.includes(r.id)).map(r=>r.id);
 if(missing.length)throw Error(`Missing rule contracts: ${missing.join(', ')}`);
 return contracts;
}
export function selectRuleContracts({tasks=[],ruleIds=[]}={},contracts=loadRuleContracts()){
 if(!Array.isArray(tasks)||!Array.isArray(ruleIds))throw Error('tasks and ruleIds must be arrays');
 const unknown=tasks.filter(t=>!taskVocabulary.has(t));if(unknown.length)throw Error(`Unknown task tags: ${unknown.join(', ')}`);
 const unknownIds=ruleIds.filter(id=>!contracts.some(c=>c.id===id));if(unknownIds.length)throw Error(`Unknown rule IDs: ${unknownIds.join(', ')}`);
 if(!tasks.length&&!ruleIds.length)throw Error('Select at least one task or rule ID; no implicit all-rules scan');
 const selected=contracts.filter(c=>ruleIds.includes(c.id)||c.tasks.some(t=>tasks.includes(t)));
 return {schema_version:'1.0',status:'SELECTED_NOT_EXECUTED',requested:{tasks,rule_ids:ruleIds},selected_rules:selected.map(c=>({id:c.id,tasks:c.tasks,mechanism:c.mechanism,evidence_kind:c.evidence.kind,verification:c.verification.method})),counts:{selected:selected.length,total:contracts.length},limitations:['Selection is based on declared task tags, not inferred user intent.','Selection does not execute static checks or browser tasks.']};
}
export function contractCatalog(contracts=loadRuleContracts()){
 return {schema_version:'1.0',status:'CONTRACTS_VALIDATED_NOT_EXECUTED',rules:contracts.map(c=>({id:c.id,tasks:c.tasks,cases:c.cases.map(x=>({name:x.name,expected:x.expect_detected}))})),counts:{rules:contracts.length,cases:contracts.reduce((n,c)=>n+c.cases.length,0)}};
}
