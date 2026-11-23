#!/usr/bin/env node
import {auditNetworkOutcomes} from './network-outcomes-v44.js';
import fs from 'node:fs';
import {unifiedReport,unifiedMarkdown} from './unified.js';
import {audit,markdown} from './audit.js';
import {rules} from './rules.js';
import {contractCatalog,selectRuleContracts} from './rule-contracts.js';
import {plan} from './plan.js';
import {sarif} from './sarif.js';
import {runtimeAudit} from './runtime.js';
import {benchmark} from './benchmark.js';
import {evaluate} from './evaluate.js';
import {compareEvaluation} from './evaluation-protocol.js';
import {addSnapshot,checkSnapshots} from './dataset.js';
import {submitReview,compareReviews,adjudicate,exportReviewed} from './review.js';
import {attachEvidence,checkEvidence} from './evidence.js';
import {correlateEvidence,checkCorrelations} from './evidence-correlation.js';
import {readContract,verifyInteraction,playwrightAdapter,evidenceManifest,verifyEvidenceManifest} from './interaction.js';
import {contractCoverage,observedCoverage} from './coverage.js';
import {taskCoverage} from './tasks.js';
import {evaluateStateMachine} from './state-machine.js';
import {bridgeBrowserReport,executeBrowserState} from './browser-state-bridge.js';
import {browserTimeline} from './browser-timeline.js';
import {validateObservationPolicy,evaluateContinuousObservations} from './continuous-observer.js';
import {auditObservedCausality} from './continuous-v43.js';
import {assuranceReport,executeAssuranceSafely} from './assurance.js';
import {doctor} from './doctor.js';
import {evaluationGate} from './evaluation-gate.js';
import {evaluationTriage} from './evaluation-triage.js';
import {verifyProvenance} from './provenance-check.js';
import {auditReviewDataset} from './review-audit.js';
import {qualityAudit,qualityMarkdown} from './quality.js';
import {readAndEvaluateEvolution,evolutionMarkdown} from './evolution.js';
import {initProject} from './init-project.js';
const [command,...args]=process.argv.slice(2);
function option(flag,fallback){const i=args.indexOf(flag);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for ${flag}`);return args[i+1];}
function positionals(){const result=[];for(let i=0;i<args.length;i++){if(['--format','--out','--brief','--browser','--contract','--evidence-dir','--baseline','--source','--id','--technology','--repository','--revision','--source-path','--reviewer','--reviewers','--adjudicator','--guideline','--file','--evidence-id','--kind','--scenario','--step','--line','--column','--note','--report','--rule','--manifest','--tasks','--evidence-manifest','--policy','--checkout','--task','--rule-id','--observations'].includes(args[i])){i++;continue;}if(['--trace-all','--execute','--ci','--agent'].includes(args[i]))continue;if(args[i].startsWith('--'))throw Error(`Unknown flag: ${args[i]}`);result.push(args[i]);}return result;}
function gateExit(status){return status==='READY_FOR_VERIFICATION'||status==='PASS'||status==='CANDIDATE_ACCEPTED'?0:status==='NOT_VERIFIED'||status==='NEEDS_INPUT'||status==='INCONCLUSIVE'||status==='NOT_COMPARABLE'?3:status==='BLOCK'?1:1;}
function emit(data,format,out){const output=format==='json'?JSON.stringify(data,null,2):format==='sarif'?JSON.stringify(sarif(data),null,2):markdown(data);if(out)fs.writeFileSync(out,output+'\n');else console.log(output);}
try{
 if(command==='doctor'){positionals();const result=doctor();const out=option('--out',null);const output=JSON.stringify(result,null,2)+'\n';if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status!=='READY')process.exitCode=1;}
 else if(command==='init'){const target=positionals()[0]||'.';const result=initProject(target,{ci:args.includes('--ci'),agent:args.includes('--agent')});console.log(JSON.stringify(result,null,2));}
 else if(command==='audit'){const target=positionals()[0]||'.';const format=option('--format','markdown');if(!['markdown','json','sarif'].includes(format))throw Error('Invalid format');const report=audit(target);emit(report,format,option('--out',null));const threshold=report.configuration.fail_on; if((threshold==='error'&&report.findings.some(f=>f.status==='FAIL'&&f.severity==='error'))||(threshold==='warning'&&report.findings.some(f=>f.status==='FAIL')))process.exitCode=1;}
 else if(command==='quality'){const target=positionals()[0]||'.';const format=option('--format','markdown');if(!['markdown','json'].includes(format))throw Error('Invalid quality format');const report=qualityAudit(target,{task:option('--task',null),brief:option('--brief',null)});const output=format==='json'?JSON.stringify(report,null,2)+'\n':qualityMarkdown(report);const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);process.exitCode=gateExit(report.status);}
 else if(command==='evolve'){const file=positionals()[0];if(!file)throw Error('evolve requires MANIFEST.json');const format=option('--format','markdown');if(!['markdown','json'].includes(format))throw Error('Invalid evolution format');const report=readAndEvaluateEvolution(file);const output=format==='json'?JSON.stringify(report,null,2)+'\n':evolutionMarkdown(report);const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(!['CANDIDATE_ACCEPTED'].includes(report.status))process.exitCode=1;}
 else if(command==='runtime'){const target=positionals()[0];if(!target)throw Error('runtime requires URL or HTML file');const format=option('--format','markdown');if(!['markdown','json','sarif'].includes(format))throw Error('Invalid format');const report=await runtimeAudit(target,{browser:option('--browser','chromium')});emit(report,format,option('--out',null));if(report.findings.some(f=>f.severity==='error'))process.exitCode=1;}
 else if(command==='interaction'){positionals();const file=option('--contract',null);if(!file)throw Error('interaction requires --contract FILE');const format=option('--format','json');if(!['json','markdown'].includes(format))throw Error('Invalid interaction format');const contract=readContract(file);const adapter=await playwrightAdapter(option('--browser','chromium'),{captureTrace:!!option('--evidence-dir',null)});const report=await verifyInteraction(contract,adapter,{evidence_dir:option('--evidence-dir',null),trace_on_success:args.includes('--trace-all')});const output=format==='json'?JSON.stringify(report,null,2):`# Interaction Verification\n\n${report.scenarios.map(s=>`- ${s.id}: ${s.status}`).join('\n')}\n\n${report.findings.map(f=>`- ${f.scenario} step ${f.step}: ${f.evidence}`).join('\n')}\n`;const out=option('--out',null);if(out)fs.writeFileSync(out,output+'\n');else console.log(output);if(report.counts.failed)process.exitCode=1;}
 else if(command==='verify'){const target=positionals()[0]||'.';const contractFile=option('--contract',null);if(!contractFile)throw Error('verify requires --contract FILE');const format=option('--format','json');if(!['json','markdown'].includes(format))throw Error('Invalid verify format');const staticReport=audit(target);const contract=readContract(contractFile);const adapter=await playwrightAdapter(option('--browser','chromium'),{captureTrace:!!option('--evidence-dir',null)});const interactionReport=await verifyInteraction(contract,adapter,{evidence_dir:option('--evidence-dir',null),trace_on_success:args.includes('--trace-all')});const result=unifiedReport(staticReport,interactionReport);const output=format==='json'?JSON.stringify(result,null,2):unifiedMarkdown(result);const out=option('--out',null);if(out)fs.writeFileSync(out,output+'\n');else console.log(output);if(result.gates.blocked)process.exitCode=1;}
 else if(command==='coverage'){positionals();const file=option('--contract',null);if(!file)throw Error('coverage requires --contract FILE');const contract=readContract(file);const reportFile=option('--report',null);const result=reportFile?observedCoverage(contract,JSON.parse(fs.readFileSync(reportFile,'utf8'))):contractCoverage(contract);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);}
 else if(command==='state-machine'){positionals();const contractFile=option('--contract',null),policyFile=option('--policy',null);if(!contractFile||!policyFile)throw Error('state-machine requires --contract and --policy');const contract=readContract(contractFile),policy=JSON.parse(fs.readFileSync(policyFile,'utf8'));const observationFile=option('--observations',null);const observations=observationFile?JSON.parse(fs.readFileSync(observationFile,'utf8')):null;const result=evaluateStateMachine(policy,contract,observations);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.counts.failed||result.counts.not_verified)process.exitCode=1;}
 else if(command==='browser-state'){
  positionals();const cf=option('--contract',null),pf=option('--policy',null),bf=option('--bindings',null);
  if(!cf||!pf||!bf)throw Error('browser-state requires --contract, --policy, --bindings');
  const contract=readContract(cf),policy=JSON.parse(fs.readFileSync(pf,'utf8')),bindings=JSON.parse(fs.readFileSync(bf,'utf8'));
  const rf=option('--report',null),execute=args.includes('--execute');
  if(execute&&rf)throw Error('browser-state --execute cannot be combined with --report');
  if(!execute&&!rf)throw Error('browser-state requires --report or --execute');
  const result=execute?(await executeBrowserState(bindings,policy,contract,await playwrightAdapter(option('--browser','chromium')))).result:bridgeBrowserReport(bindings,policy,contract,JSON.parse(fs.readFileSync(rf,'utf8')));
  const output=JSON.stringify(result,null,2)+'\n',out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);
  if(result.counts.failed||result.counts.not_verified)process.exitCode=1;
 }
 else if(command==='browser-timeline'){
  positionals();const cf=option('--contract',null),pf=option('--policy',null),bf=option('--bindings',null),rf=option('--report',null);
  if(!cf||!pf||!bf||!rf)throw Error('browser-timeline requires --contract, --policy, --bindings and --report');
  const contract=readContract(cf),policy=JSON.parse(fs.readFileSync(pf,'utf8')),bindings=JSON.parse(fs.readFileSync(bf,'utf8')),report=JSON.parse(fs.readFileSync(rf,'utf8'));
  const result=browserTimeline(bindings,policy,contract,report);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);
  if(result.status!=='ASSERTIONS_TIMED')process.exitCode=1;
 }
 else if(command==='network-outcomes'){
  positionals();const rf=option('--report',null);if(!rf)throw Error('network-outcomes requires --report FILE');const result=auditNetworkOutcomes(JSON.parse(fs.readFileSync(rf,'utf8')));const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status!=='CLASSIFIED')process.exitCode=1;
 }
 else if(command==='observe-states'||command==='audit-causality'){
  positionals();const cf=option('--contract',null),pf=option('--policy',null),rf=option('--report',null);
  if(!cf||!pf)throw Error('observe-states requires --contract and --policy');
  if(!!rf===args.includes('--execute'))throw Error('Use exactly one of --report or --execute');
  const contract=readContract(cf),policy=JSON.parse(fs.readFileSync(pf,'utf8'));
  const errors=validateObservationPolicy(policy,contract);if(errors.length)throw Error(errors.join('; '));
  const report=rf?JSON.parse(fs.readFileSync(rf,'utf8')):await verifyInteraction(contract,await playwrightAdapter(option('--browser','chromium')),{observation_policy:policy});
  const result=command==='audit-causality'?auditObservedCausality(policy,contract,report):evaluateContinuousObservations(policy,contract,report);
  const output=JSON.stringify(result,null,2)+'\n',out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);
  if(result.status!=='OBSERVED_CONTRACT_MATCH')process.exitCode=1;
 }
 else if(command==='tasks'){positionals();const taskFile=option('--tasks',null),contractFile=option('--contract',null);if(!taskFile||!contractFile)throw Error('tasks requires --tasks FILE and --contract FILE');const contract=readContract(contractFile);const manifest=JSON.parse(fs.readFileSync(taskFile,'utf8'));taskCoverage(manifest,contract);const reportFile=option('--report',null);if(args.includes('--execute')&&reportFile)throw Error('tasks --execute cannot be combined with --report');const report=args.includes('--execute')?await verifyInteraction(contract,await playwrightAdapter(option('--browser','chromium'),{captureTrace:!!option('--evidence-dir',null)}),{evidence_dir:option('--evidence-dir',null)}):(reportFile?JSON.parse(fs.readFileSync(reportFile,'utf8')):null);const result=taskCoverage(manifest,contract,report);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(report&&(result.counts.failed||result.counts.not_verified))process.exitCode=1;}
 else if(command==='assure'){
  positionals();const contractFile=option('--contract',null),tasksFile=option('--tasks',null);
  if(!contractFile||!tasksFile)throw Error('assure requires --contract FILE and --tasks FILE');
  const contract=readContract(contractFile),tasks=JSON.parse(fs.readFileSync(tasksFile,'utf8'));
  const reportFile=option('--report',null),manifestFile=option('--evidence-manifest',null),dir=option('--evidence-dir',null);
  const execute=args.includes('--execute');
  if(execute&&(reportFile||manifestFile))throw Error('assure --execute cannot be combined with --report or --evidence-manifest');
  if(args.includes('--trace-all')&&!execute)throw Error('--trace-all requires --execute');
  const result=execute
   ?(await executeAssuranceSafely({contract,tasks,browser:option('--browser','chromium'),evidenceDir:dir,traceOnSuccess:args.includes('--trace-all')})).assurance
   :assuranceReport({contract,tasks,interaction:reportFile?JSON.parse(fs.readFileSync(reportFile,'utf8')):null,manifest:manifestFile?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null,evidenceDir:dir});
  const output=JSON.stringify(result,null,2)+'\n',out=option('--out',null);
  if(out)fs.writeFileSync(out,output);else console.log(output);
  if(result.gate.blocks_ci)process.exitCode=1;
 }
 else if(command==='plan'){positionals();const brief=option('--brief',null);if(!brief)throw Error('plan requires --brief FILE');const result=plan(brief);const out=option('--out',null);const txt=JSON.stringify(result,null,2)+'\n';if(out)fs.writeFileSync(out,txt);else console.log(txt);if(result.status==='NEEDS_INPUT')process.exitCode=1;}
 else if(command==='benchmark'){const file=positionals()[0]||'tests/fixtures/behavior/manifest.json';const result=benchmark(file);console.log(JSON.stringify(result,null,2));if(result.counts.false_positives||result.counts.false_negatives)process.exitCode=1;}
 else if(command==='evaluate'){const file=positionals()[0]||'tests/fixtures/evaluation/manifest.json';const result=evaluate(file);const baselineFile=option('--baseline',null);if(baselineFile){const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));result.comparison=compareEvaluation(result,baseline);}const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.counts.fp||result.counts.fn||result.counts.unexpected_unverified||(result.comparison&&!result.comparison.comparable))process.exitCode=1;}
 else if(command==='provenance-check'){const dir=positionals()[0],checkout=option('--checkout',null);if(!dir||!checkout)throw Error('provenance-check requires DATASET and --checkout PATH');const result=verifyProvenance(dir,checkout);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status!=='LOCAL_BLOBS_MATCH')process.exitCode=1;}
 else if(command==='evaluation-triage'){const manifest=positionals()[0];if(!manifest)throw Error('evaluation-triage requires a dataset manifest');const base=option('--baseline',null);const result=evaluationTriage(evaluate(manifest),{baseline:base?JSON.parse(fs.readFileSync(base,'utf8')):null});const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status==='REGRESSION')process.exitCode=1;}
 else if(command==='evaluation-gate'){const [manifest]=positionals();const policyFile=option('--policy',null);if(!manifest||!policyFile)throw Error('evaluation-gate requires manifest path and --policy FILE');const result=evaluationGate(evaluate(manifest),JSON.parse(fs.readFileSync(policyFile,'utf8')));const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status!=='ADEQUATE_FOR_POLICY')process.exitCode=1;}
 else if(command==='dataset'){
  const [action,datasetPath]=positionals();if(!datasetPath)throw Error('dataset requires an action and a dataset directory');
  if(action==='add'){const required=['--source','--id','--technology','--repository','--revision','--source-path'];for(const flag of required)if(!option(flag,null))throw Error(`dataset add requires ${flag}`);console.log(JSON.stringify(addSnapshot({dataset:datasetPath,source:option('--source'),id:option('--id'),technology:option('--technology'),repository:option('--repository'),revision:option('--revision'),sourcePath:option('--source-path')}),null,2));}
  else if(action==='review'){const id=positionals()[2];console.log(JSON.stringify(submitReview({dataset:datasetPath,id,reviewer:option('--reviewer'),file:option('--file'),guidelineVersion:option('--guideline')}),null,2));}
  else if(action==='compare'){const id=positionals()[2];console.log(JSON.stringify(compareReviews({dataset:datasetPath,id,reviewers:(option('--reviewers')||'').split(',')}),null,2));}
  else if(action==='adjudicate'){const id=positionals()[2];console.log(JSON.stringify(adjudicate({dataset:datasetPath,id,reviewers:(option('--reviewers')||'').split(','),adjudicator:option('--adjudicator'),file:option('--file')}),null,2));}
  else if(action==='review-audit'){const result=auditReviewDataset(datasetPath);const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);if(result.status!=='READY_FOR_EXPORT')process.exitCode=1;}
  else if(action==='export'){console.log(JSON.stringify(exportReviewed({dataset:datasetPath,out:option('--out')}),null,2));}
  else if(action==='evidence-add'){const id=positionals()[2];const line=option('--line',null),column=option('--column',null),step=option('--step',null);const location=line===null?null:{line:Number(line),...(column===null?{}:{column:Number(column)})};console.log(JSON.stringify(attachEvidence({datasetDir:datasetPath,caseId:id,evidenceId:option('--evidence-id'),file:option('--file'),kind:option('--kind'),scenario:option('--scenario',undefined),step:step===null?undefined:Number(step),location,note:option('--note',undefined)}),null,2));}
  else if(action==='evidence-correlate'){const id=positionals()[2];console.log(JSON.stringify(correlateEvidence({datasetDir:datasetPath,caseId:id,evidenceId:option('--evidence-id'),reportFile:option('--report'),scenario:option('--scenario'),step:Number(option('--step')),ruleId:option('--rule')}),null,2));}
  else if(action==='evidence-links-check'){const result=checkCorrelations(datasetPath,{reportFile:option('--report',undefined)});console.log(JSON.stringify(result,null,2));if(result.counts.invalid)process.exitCode=1;}
  else if(action==='evidence-check'){const result=checkEvidence(datasetPath);console.log(JSON.stringify(result,null,2));if(result.counts.invalid)process.exitCode=1;}
  else if(action==='check'){const result=checkSnapshots(datasetPath);console.log(JSON.stringify(result,null,2));if(result.counts.intact!==result.counts.total)process.exitCode=1;}
  else throw Error('dataset supports add|check|review|compare|adjudicate|review-audit|export|evidence-add|evidence-check|evidence-correlate|evidence-links-check');
 }
 else if(command==='evidence-manifest'){const dir=positionals()[0];if(!dir)throw Error('evidence-manifest requires evidence directory');const reportFile=option('--report',null);if(!reportFile)throw Error('evidence-manifest requires --report');const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));const result=evidenceManifest(report.artifacts??[],{dir});const out=option('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));}
 else if(command==='evidence-verify'){const dir=positionals()[0];const manifestFile=option('--manifest',null);if(!dir||!manifestFile)throw Error('evidence-verify requires directory and --manifest');const result=verifyEvidenceManifest(JSON.parse(fs.readFileSync(manifestFile,'utf8')),dir);console.log(JSON.stringify(result,null,2));if(result.counts.intact!==result.counts.total)process.exitCode=1;}
 else if(command==='rule-contracts'){positionals();const task=option('--task',null),ruleId=option('--rule-id',null);const result=task||ruleId?selectRuleContracts({tasks:task?task.split(','):[],ruleIds:ruleId?ruleId.split(','):[]}):contractCatalog();const output=JSON.stringify(result,null,2)+'\n';const out=option('--out',null);if(out)fs.writeFileSync(out,output);else console.log(output);}
 else if(command==='rules'){positionals();console.log(JSON.stringify(rules,null,2));}
 else {console.log('Usage: uiux browser-state --contract FILE --policy FILE --bindings FILE (--report FILE | --execute) [--out FILE] | uiux state-machine --contract FILE --policy FILE [--observations FILE] [--out FILE] | uiux rule-contracts [--task form,navigation | --rule-id HTML-004] [--out FILE] | uiux doctor [--out FILE] | uiux assure --tasks FILE --contract FILE [--execute --browser chromium [--evidence-dir DIR] | --report FILE] [--evidence-manifest FILE --evidence-dir DIR] [--out FILE] | uiux tasks --tasks FILE --contract FILE [--report interaction.json | --execute [--browser chromium] [--evidence-dir DIR]] [--out tasks.json] | uiux coverage --contract FILE [--report interaction.json] [--out coverage.json] | uiux init | uiux audit [path] [--format json|markdown|sarif] [--out file] | uiux runtime URL_OR_HTML [--browser chromium|firefox|webkit] [--format json|markdown|sarif] | uiux interaction --contract file.json [--browser chromium|firefox|webkit] [--format json|markdown] [--out file] [--evidence-dir DIR] [--trace-all] | uiux verify [path] --contract FILE [--evidence-dir DIR] [--trace-all] [--format json|markdown] | uiux plan --brief file.json [--out file] | uiux benchmark [manifest.json] | uiux provenance-check DATASET --checkout LOCAL_GIT_ROOT [--out FILE] | uiux evaluation-triage MANIFEST [--baseline REPORT.json] [--out FILE] | uiux evaluation-gate MANIFEST --policy POLICY.json [--out FILE] | uiux evaluate [manifest.json] [--out file] [--baseline prior-evaluation.json] | uiux dataset add DIR --source FILE --id ID --technology STACK --repository HTTPS_URL --revision COMMIT --source-path PATH | uiux dataset check DIR | uiux dataset review DIR CASE_ID --reviewer ID --guideline VERSION --file labels.json | uiux dataset compare DIR CASE_ID --reviewers A,B | uiux dataset adjudicate DIR CASE_ID --reviewers A,B --adjudicator C --file decisions.json | uiux dataset review-audit DIR [--out REPORT.json] | uiux dataset export DIR --out DIR/curated.json | uiux dataset evidence-add DIR CASE_ID --evidence-id ID --kind screenshot|trace|dom-snapshot|manual-note|runtime-report --file FILE [--line N --column N] [--scenario ID --step N] | uiux dataset evidence-check DIR | uiux dataset evidence-correlate DIR CASE_ID --evidence-id ID --report REPORT.json --scenario ID --step N --rule FLOW-ASSERTION_FAILED | uiux dataset evidence-links-check DIR [--report REPORT.json] | uiux rules');if(command)process.exitCode=2;}
}catch(e){console.error(`uiux: ${e.message}`);process.exitCode=2;}
