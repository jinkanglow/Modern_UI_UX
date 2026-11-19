/** User-task verification: declared scenario assertions are necessary evidence, not business outcome proof. */
import {validateContract,contractFingerprint} from './interaction.js';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(x);
const MAX_TASKS=100;
export function validateTaskManifest(manifest,contract){
 const errors=[];
 if(!object(manifest))return ['Task manifest must be an object'];
 if(!['2.1','2.2'].includes(manifest.schema_version))errors.push('schema_version must be 2.1 or 2.2');
 if(!id(manifest.id))errors.push('manifest id must be a safe identifier');
 if(!object(contract)||validateContract(contract).length)errors.push('interaction contract is invalid');
 if(manifest.contract_id!==contract?.id)errors.push('contract_id must match the interaction contract');
 if(!Array.isArray(manifest.tasks)||manifest.tasks.length<1||manifest.tasks.length>MAX_TASKS)return [...errors,'tasks must contain 1..100 entries'];
 const scenarioMap=new Map((contract?.scenarios??[]).map(s=>[s.id,s]));
 const seen=new Set();
 for(const [index,t] of manifest.tasks.entries()){
  const p=`tasks[${index}]`;
  if(!object(t)){errors.push(`${p} must be an object`);continue;}
  if(!id(t.id)||seen.has(t.id))errors.push(`${p}.id must be unique and safe`);else seen.add(t.id);
  if(typeof t.actor!=='string'||!t.actor.trim()||t.actor.length>200)errors.push(`${p}.actor is required (max 200 chars)`);
  if(typeof t.goal!=='string'||!t.goal.trim()||t.goal.length>500)errors.push(`${p}.goal is required (max 500 chars)`);
  if(typeof t.completion_condition!=='string'||!t.completion_condition.trim()||t.completion_condition.length>500)errors.push(`${p}.completion_condition is required (max 500 chars)`);
  if(!Array.isArray(t.required_scenarios)||t.required_scenarios.length===0||t.required_scenarios.length>50){errors.push(`${p}.required_scenarios must contain 1..50 scenario IDs`);continue;}
  if(new Set(t.required_scenarios).size!==t.required_scenarios.length)errors.push(`${p}.required_scenarios must not repeat IDs`);
  if(manifest.schema_version==='2.2'){
   if(!Array.isArray(t.required_assertions)||t.required_assertions.length===0||t.required_assertions.length>100)errors.push(`${p}.required_assertions must contain 1..100 entries`);
   else {
    const fingerprints=new Set();
    for(const [k,a] of t.required_assertions.entries()){
     const q=`${p}.required_assertions[${k}]`;
     if(!object(a)||!id(a.scenario)||!Number.isInteger(a.step)||a.step<1||!Number.isInteger(a.assertion)||a.assertion<1){errors.push(`${q} requires scenario, 1-based step and assertion`);continue;}
     const key=`${a.scenario}:${a.step}:${a.assertion}`;
     if(fingerprints.has(key))errors.push(`${q} duplicates another assertion`);
     fingerprints.add(key);
     if(!t.required_scenarios.includes(a.scenario))errors.push(`${q} scenario is not required by task`);
     const declared=scenarioMap.get(a.scenario)?.steps[a.step-1]?.expect[a.assertion-1];
     if(!declared)errors.push(`${q} does not refer to a declared assertion`);
     else if(a.check!==declared.check||a.target!==(declared.selector??declared.url)||!Object.hasOwn(a,'equals')!==!Object.hasOwn(declared,'equals')|| (Object.hasOwn(declared,'equals')&&a.equals!==declared.equals))errors.push(`${q} does not match contract check, target and expected value`);
    }
   }
  }
  for(const scenarioId of t.required_scenarios){
   const s=scenarioMap.get(scenarioId);
   if(!s){errors.push(`${p}: unknown scenario ${String(scenarioId)}`);continue;}
   if(!s.steps.some(step=>step.expect.length>0))errors.push(`${p}: scenario ${scenarioId} has no explicit assertions`);
  }
 }
 return errors;
}
export function taskCoverage(manifest,contract,report=null){
 const errors=validateTaskManifest(manifest,contract);if(errors.length)throw Error(`Invalid task manifest:\n${errors.join('\n')}`);
 let reports=null;
 if(report!==null){
  if(!object(report)||report.contract_id!==contract.id||!Array.isArray(report.scenarios))throw Error('Interaction report does not match the contract');
  if(manifest.schema_version==='2.2'&&report.contract_sha256!==contractFingerprint(contract))throw Error('Interaction report contract fingerprint is missing or does not match');
  reports=new Map();
  const expected=new Map(contract.scenarios.map(s=>[s.id,s]));
  for(const r of report.scenarios){
   if(!object(r)||!expected.has(r.id)||reports.has(r.id)||!Array.isArray(r.steps)||!['PASS','FAIL'].includes(r.status))throw Error('Unexpected or malformed scenario result');
   const steps=expected.get(r.id).steps;
   if(r.steps.length>steps.length)throw Error('More steps than declared');
   for(const [i,step] of r.steps.entries()){
    if(!object(step)||step.index!==i+1||step.action!==steps[i].action||!['PASS','FAIL'].includes(step.status)||!Array.isArray(step.checks)||step.checks.length>steps[i].expect.length)throw Error('Invalid step result');
    for(const [j,check] of step.checks.entries())if(!object(check)||check.check!==steps[i].expect[j].check||!['PASS','FAIL'].includes(check.status))throw Error('Invalid assertion result');
    if(step.status==='PASS'&&(step.checks.length!==steps[i].expect.length||step.checks.some(c=>c.status!=='PASS')))throw Error('Step PASS requires all declared assertions to pass');
   }
   if(r.status==='PASS'&&(r.steps.length!==steps.length||r.steps.some(s=>s.status!=='PASS')))throw Error('Scenario PASS requires all steps to pass');
   if(r.status==='FAIL'&&r.steps.length===steps.length&&r.steps.every(s=>s.status==='PASS'))throw Error('Scenario FAIL contradicts passing steps');
   reports.set(r.id,r);
  }
 }
 const tasks=manifest.tasks.map(t=>{
  const scenarios=t.required_scenarios.map(scenarioId=>{
   const r=reports?.get(scenarioId);
   return {id:scenarioId,status:!reports||!r?'NOT_EXECUTED':r.status};
  });
  const assertion_evidence=manifest.schema_version==='2.2'?t.required_assertions.map(a=>({scenario:a.scenario,step:a.step,assertion:a.assertion,status:reports?.get(a.scenario)?.steps[a.step-1]?.checks[a.assertion-1]?.status??'NOT_EXECUTED'})):[];
  const status=scenarios.some(s=>s.status==='FAIL')?'FAIL':scenarios.some(s=>s.status==='NOT_EXECUTED')||assertion_evidence.some(a=>a.status!=='PASS')?'NOT_VERIFIED':'VERIFIED_CONTRACT';
  return {id:t.id,actor:t.actor,goal:t.goal,completion_condition:t.completion_condition,status,required_scenarios:scenarios,...(manifest.schema_version==='2.2'?{assertion_evidence}:{})};
 });
 return {schema_version:manifest.schema_version,mode:reports?'task-observation':'task-declaration',manifest_id:manifest.id,contract_id:contract.id,tasks,counts:{total:tasks.length,verified_contract:tasks.filter(t=>t.status==='VERIFIED_CONTRACT').length,failed:tasks.filter(t=>t.status==='FAIL').length,not_verified:tasks.filter(t=>t.status==='NOT_VERIFIED').length},limitations:['VERIFIED_CONTRACT means the explicitly required browser assertions passed; it does not establish real-world business completion.','Task goals and completion conditions are human-authored statements; the engine does not independently validate their correctness.','Only named scenarios count. Undeclared flows and real production backend behavior remain untested.','A report fingerprint checks contract identity, not the authenticity of browser execution; only trusted execution environments can establish provenance.']};
}
