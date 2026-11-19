/** v2.5: Evidence-aware task assurance summary. Does not certify browser provenance. */
import {contractFingerprint,validateContract,verifyEvidenceManifest,verifyInteraction,playwrightAdapter,evidenceManifest} from './interaction.js';
import {taskCoverage,validateTaskManifest} from './tasks.js';
import {validateInteractionReportIntegrity} from './report-integrity.js';

const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function assuranceReport({contract,tasks,interaction=null,manifest=null,evidenceDir=null,executionSource='supplied-report'}){
 if(!['supplied-report','in-process'].includes(executionSource))throw Error('Invalid execution source');
 const contractErrors=validateContract(contract);
 if(contractErrors.length)throw Error(`Invalid contract: ${contractErrors.join('; ')}`);
 const taskErrors=validateTaskManifest(tasks,contract);
 if(taskErrors.length)throw Error(`Invalid tasks: ${taskErrors.join('; ')}`);
 if(interaction!==null){
  if(!isObject(interaction)||interaction.contract_sha256!==contractFingerprint(contract))throw Error('Interaction report fingerprint missing or mismatched');
  if(interaction.mode!=='interaction'||!Array.isArray(interaction.findings)||!Array.isArray(interaction.artifacts))throw Error('Malformed interaction report');
  const integrityErrors=validateInteractionReportIntegrity(interaction,contract);
  if(integrityErrors.length)throw Error(`Interaction report integrity failure: ${integrityErrors.join('; ')}`);
 }
 const taskReport=taskCoverage(tasks,contract,interaction);
 let evidence={status:'NOT_PROVIDED',counts:{total:0,intact:0},results:[]};
 if(manifest!==null){
  if(!evidenceDir)throw Error('Evidence directory is required for a manifest');
  evidence=verifyEvidenceManifest(manifest,evidenceDir);
  evidence.status=evidence.counts.total===0?'EMPTY':evidence.counts.intact===evidence.counts.total?'INTACT':'INVALID';
 }
 const taskResults=taskReport.tasks.map(t=>({id:t.id,status:t.status,required_scenarios:t.required_scenarios,assertion_evidence:t.assertion_evidence??[]}));
 const infrastructureFailure=interaction?.findings?.some(f=>f.rule_id==='FLOW-NAVIGATION_FAILED')??false;
 const hasFailures=taskReport.counts.failed>0||interaction?.counts?.failed>0;
 const incomplete=taskReport.counts.not_verified>0||interaction===null;
 const evidenceInvalid=evidence.status==='INVALID';
 const gate=infrastructureFailure?'INFRA_ERROR':evidenceInvalid||hasFailures?'BLOCK':incomplete?'INCOMPLETE':'CONTRACT_PASS';
 return {
  schema_version:'2.9',engine_version:'2.9.0',contract_id:contract.id,contract_sha256:contractFingerprint(contract),
  manifest_id:tasks.id,execution:{status:interaction===null?'NOT_EXECUTED':executionSource==='in-process'?'IN_PROCESS_OBSERVED_NOT_ATTESTED':'REPORT_SUPPLIED_UNAUTHENTICATED',scenarios_declared:contract.scenarios.length,scenarios_reported:interaction?.scenarios.length??0},
  tasks:taskResults,counts:taskReport.counts,evidence_integrity:evidence,
  gate:{status:gate,blocks_ci:gate!=='CONTRACT_PASS',reasons:[...(infrastructureFailure?['Browser navigation failed; application assertions were not verified']:[]),...(!infrastructureFailure&&hasFailures?['Failed task or browser scenario']:[]),...(incomplete?['Missing task or execution evidence']:[]),...(evidenceInvalid?['Evidence integrity mismatch']:[])]},
  limitations:['Supplied reports are unauthenticated. In-process observation is not cryptographic attestation of the browser, runner or backend.', 'A passing task proves only the declared assertions in the supplied report, not real-world business completion.', 'SHA-256 integrity is not evidence of screenshot authenticity or trusted execution.', 'Browser URLs, DOM text, input values and raw error details are deliberately omitted from this summary.']
 };
}

/** Execute the supplied contract inside this process, then compute the task gate.
 * The adapter factory is injectable for deterministic tests; production defaults to Playwright.
 * No report is fabricated when browser initialization or navigation fails.
 */
export async function executeAssurance({contract,tasks,browser='chromium',evidenceDir=null,traceOnSuccess=false,adapterFactory=playwrightAdapter}){
 const contractErrors=validateContract(contract);
 if(contractErrors.length)throw Error(`Invalid contract: ${contractErrors.join('; ')}`);
 const taskErrors=validateTaskManifest(tasks,contract);
 if(taskErrors.length)throw Error(`Invalid tasks: ${taskErrors.join('; ')}`);
 const adapter=await adapterFactory(browser,{captureTrace:!!evidenceDir});
 const interaction=await verifyInteraction(contract,adapter,{evidence_dir:evidenceDir,trace_on_success:traceOnSuccess});
 const manifest=evidenceDir?evidenceManifest(interaction.artifacts,{dir:evidenceDir}):null;
 const assurance=assuranceReport({contract,tasks,interaction,manifest,evidenceDir,executionSource:'in-process'});
 return {assurance,interaction,manifest};
}

/** Fail closed on browser initialization/runner exceptions. Never serialize raw error messages,
 * which can contain URLs, paths, tokens, or user input. This is a diagnostic, not attestation. */
export async function executeAssuranceSafely(options){
 try{return await executeAssurance(options);}
 catch(error){
  // Contract errors are caller input errors, not infrastructure failures.
  if(/^Invalid (contract|tasks):/.test(String(error?.message??'')))throw error;
  const category=/playwright|browser|chromium|firefox|webkit|executable|install/i.test(String(error?.message??''))?'BROWSER_UNAVAILABLE':'RUNNER_FAILURE';
  return {assurance:{schema_version:'2.9',engine_version:'2.9.0',
   execution:{status:'NOT_EXECUTED',category,provenance:'NOT_ATTESTED'},
   gate:{status:'INFRA_ERROR',blocks_ci:true,reasons:['Browser runner could not complete; no UX verdict is available']},
   limitations:['Raw exception details are intentionally excluded; inspect trusted runner logs locally.','This result does not prove a UX defect or browser execution provenance.']},
   interaction:null,manifest:null};
 }
}
