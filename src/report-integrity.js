/** Structural consistency validation for untrusted interaction report JSON.
 * This is NOT a signature or proof of execution provenance.
 */
export function validateInteractionReportIntegrity(report, contract) {
 const errors=[];
 if(!report||typeof report!=='object'||!Array.isArray(report.scenarios))return ['Missing scenario results'];
 const declared=new Map(contract.scenarios.map(s=>[s.id,s]));
 const seen=new Set();
 for(const scenario of report.scenarios){
  if(!scenario||!declared.has(scenario.id)||seen.has(scenario.id)){errors.push('Unknown or repeated scenario');continue;}
  seen.add(scenario.id);
  const expected=declared.get(scenario.id).steps;
  if(!Array.isArray(scenario.steps)||scenario.steps.length>expected.length){errors.push(`Invalid steps for ${scenario.id}`);continue;}
  const navigationFailed=scenario.steps.length===0&&Array.isArray(report.findings)&&report.findings.some(f=>f?.scenario===scenario.id&&f?.step===0&&f?.rule_id==='FLOW-NAVIGATION_FAILED');
  let allPassed=scenario.steps.length===expected.length;
  let anyFailed=navigationFailed;
  for(let i=0;i<scenario.steps.length;i++){
   const step=scenario.steps[i];const expectedStep=expected[i];
   if(!step||step.index!==i+1||step.action!==expectedStep.action||!Array.isArray(step.checks)||step.checks.length>expectedStep.expect.length){errors.push(`Invalid step ${scenario.id}:${i+1}`);allPassed=false;continue;}
   const checksComplete=step.checks.length===expectedStep.expect.length;
   let checksPassed=checksComplete;
   for(let j=0;j<step.checks.length;j++){
    const check=step.checks[j];
    if(!check||check.check!==expectedStep.expect[j].check||!['PASS','FAIL'].includes(check.status)){errors.push(`Invalid check ${scenario.id}:${i+1}:${j+1}`);checksPassed=false;}
    else if(check.status==='FAIL')checksPassed=false;
   }
   if(!['PASS','FAIL'].includes(step.status)||step.status==='PASS'&&!checksPassed)errors.push(`Contradictory PASS step ${scenario.id}:${i+1}`);
   if(step.status==='FAIL'&&checksPassed)errors.push(`Contradictory FAIL step ${scenario.id}:${i+1}`);
   if(step.status==='FAIL')anyFailed=true;
   if(step.status!=='PASS')allPassed=false;
   if(step.status==='FAIL'&&i!==scenario.steps.length-1)errors.push(`Steps continue after failure ${scenario.id}:${i+1}`);
  }
  if(scenario.status==='PASS'&&!allPassed||scenario.status==='FAIL'&&!anyFailed||!['PASS','FAIL'].includes(scenario.status))errors.push(`Contradictory scenario status ${scenario.id}`);
 }
 if(seen.size!==declared.size)errors.push('Incomplete scenario coverage');
 const failed=report.scenarios.filter(s=>s?.status==='FAIL').length;
 const passed=report.scenarios.filter(s=>s?.status==='PASS').length;
 if(!report.counts||report.counts.scenarios!==report.scenarios.length||report.counts.failed!==failed||report.counts.passed!==passed)errors.push('Reported counts disagree with scenario results');
 return errors;
}
