/** Contract coverage is a declaration inventory, not a measure of observed UX quality. */
import {validateContract} from './interaction.js';

const CHECKS=['visible','hidden','enabled','disabled','text','value','count','request_count'];
const ACTIONS=['click','double_click','fill','press','wait','assert_only'];
const FAILURE_MODES=['http_error','network_abort','delayed_response'];
function bucket(items){return Object.fromEntries(items.map(x=>[x,0]));}
function mode(route){if(route.mode==='abort')return 'network_abort';if(route.mode==='fulfill'&&route.status>=400)return 'http_error';if(route.mode==='fulfill'&&route.delay_ms>0)return 'delayed_response';return null;}
export function contractCoverage(contract){
 const errors=validateContract(contract);if(errors.length)throw Error(`Invalid interaction contract:\n${errors.join('\n')}`);
 const actions=bucket(ACTIONS),checks=bucket(CHECKS),failureModes=bucket(FAILURE_MODES),states={};
 const scenarios=[];let assertions=0,steps=0;
 for(const scenario of contract.scenarios){
  const sc={id:scenario.id,steps:scenario.steps.length,assertions:0,states:[],network_modes:[]};
  for(const step of scenario.steps){steps++;actions[step.action]++;if(step.state){states[step.state]=(states[step.state]??0)+1;if(!sc.states.includes(step.state))sc.states.push(step.state);}
   for(const a of step.expect){assertions++;sc.assertions++;checks[a.check]++;}
  }
  for(const route of scenario.routes??contract.routes??[]){const m=mode(route);if(m){failureModes[m]++;if(!sc.network_modes.includes(m))sc.network_modes.push(m);}}
  scenarios.push(sc);
 }
 const absent={actions:Object.keys(actions).filter(x=>!actions[x]),checks:Object.keys(checks).filter(x=>!checks[x]),failure_modes:Object.keys(failureModes).filter(x=>!failureModes[x])};
 return {schema_version:'2.0',mode:'contract-coverage',contract_id:contract.id,counts:{scenarios:scenarios.length,steps,assertions},actions,checks,states,network_failure_modes:failureModes,scenarios,not_declared:absent,limitations:['Counts only what the contract declares; no browser or application was executed.','Missing categories are not necessarily defects: relevance depends on the product and user tasks.','A declared assertion is not a passing assertion. Runtime verification is required.']};
}
/** Runtime coverage joins only exact scenario and step IDs, never infers task success from labels. */
export function observedCoverage(contract,report){
 const declared=contractCoverage(contract);
 if(report.contract_id!==contract.id)throw Error('Report contract_id does not match contract');
 if(!Array.isArray(report.scenarios))throw Error('Invalid interaction report');
 const expected=new Map(contract.scenarios.map(s=>[s.id,s]));
 const seen=new Set();let passedSteps=0,failedSteps=0,unexecutedSteps=0,passedScenarios=0,failedScenarios=0;
 for(const result of report.scenarios){
  if(!expected.has(result.id)||seen.has(result.id))throw Error('Unexpected or duplicate scenario in report');
  seen.add(result.id);
  if(!['PASS','FAIL'].includes(result.status)||!Array.isArray(result.steps))throw Error('Invalid scenario result');
  if(result.steps.length>expected.get(result.id).steps.length)throw Error('Report has more steps than declared');
  for(const [i,step] of result.steps.entries()){
   if(step.index!==i+1||step.action!==expected.get(result.id).steps[i].action||!['PASS','FAIL'].includes(step.status))throw Error('Invalid step result');
   if(step.status==='PASS')passedSteps++;else failedSteps++;
  }
  if(result.status==='PASS'){
   if(result.steps.length!==expected.get(result.id).steps.length||result.steps.some(s=>s.status!=='PASS'))throw Error('Inconsistent passing scenario');
   passedScenarios++;
  }else failedScenarios++;
  unexecutedSteps+=expected.get(result.id).steps.length-result.steps.length;
 }
 for(const s of contract.scenarios)if(!seen.has(s.id))unexecutedSteps+=s.steps.length;
 return {...declared,mode:'observed-coverage',observed:{scenarios_reported:seen.size,scenarios_passed:passedScenarios,scenarios_failed:failedScenarios,steps_passed:passedSteps,steps_failed:failedSteps,steps_not_executed:unexecutedSteps,scenarios_not_reported:contract.scenarios.length-seen.size},limitations:[...declared.limitations,'PASS confirms only the specified checks in the observed test environment; it is not an end-user task completion rate.']};
}
