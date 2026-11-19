import fs from 'node:fs';
import path from 'node:path';
import {audit} from './audit.js';
import {selectRuleContracts} from './rule-contracts.js';

// A decision report is deliberately conservative: missing intent/evidence is
// not converted into a pass. This is the bridge between source linting and
// task verification; it is not a visual-quality score.
const intentFiles = ['DESIGN.md', 'design.md', 'UX.md', 'ux.md', 'uiux.config.json'];
const contractFiles = ['interaction.json', 'contract.json', 'tasks.json', 'tasks.yaml'];
const requiredBriefFields = ['primary_actor', 'user_goal', 'primary_scenario', 'completion_condition'];
const requiredStates = ['idle', 'result', 'error'];

function existsAny(root, names) {
  return names.filter(name => fs.existsSync(path.join(root, name)));
}

function countTokens(text) {
  // Planning estimate only. It must never be presented as model billing data.
  return Math.ceil(text.length / 4);
}

function validateBrief(file) {
  const result = {file, status: 'VALID', findings: []};
  if (!fs.existsSync(file)) return {file, status: 'INVALID', findings: [{id: 'BRIEF-000', status: 'BLOCK', severity: 'error', title: 'Brief file not found', detail: 'Pass a path to an existing JSON brief.'}]};
  let brief;
  try {
    brief = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return {file, status: 'INVALID', findings: [{id: 'BRIEF-001', status: 'BLOCK', severity: 'error', title: 'Brief is not valid JSON', detail: error.message}]};
  }
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    return {file, status: 'INVALID', findings: [{id: 'BRIEF-002', status: 'BLOCK', severity: 'error', title: 'Brief must be a JSON object', detail: 'Use the object shape in examples/ai-ux-brief.json.'}]};
  }
  for (const field of requiredBriefFields) {
    if (typeof brief[field] !== 'string' || !brief[field].trim()) {
      result.findings.push({id: 'BRIEF-003', status: 'BLOCK', severity: 'error', title: `Missing ${field}`, detail: `Brief requires a non-empty ${field}.`});
    }
  }
  const policy = brief.ai_policy;
  if (!policy || typeof policy !== 'object') {
    result.findings.push({id: 'BRIEF-004', status: 'BLOCK', severity: 'error', title: 'AI authority policy is missing', detail: 'Declare whether the system may suggest, draft, prepare, execute, or monitor.'});
  } else {
    const hasAuthority = ['may_suggest', 'may_execute', 'operation_class'].some(key => key in policy);
    if (!hasAuthority) result.findings.push({id: 'BRIEF-005', status: 'BLOCK', severity: 'error', title: 'AI authority is ambiguous', detail: 'Declare at least one explicit authority field.'});
    if (policy.may_execute === true && (!Array.isArray(policy.requires_authorization_for) || policy.requires_authorization_for.length === 0)) {
      result.findings.push({id: 'BRIEF-006', status: 'BLOCK', severity: 'error', title: 'Execution lacks authorization boundary', detail: 'may_execute=true requires non-empty requires_authorization_for.'});
    }
    for (const key of ['must_show', 'must_support']) {
      if (!Array.isArray(policy[key]) || policy[key].length === 0) result.findings.push({id: 'BRIEF-007', status: 'BLOCK', severity: 'error', title: `AI policy lacks ${key}`, detail: `Declare observable ${key.replace('_', ' ')} requirements.`});
    }
  }
  const states = brief.verification?.required_states;
  if (!Array.isArray(states)) result.findings.push({id: 'BRIEF-008', status: 'BLOCK', severity: 'error', title: 'Required states are missing', detail: 'Declare required_states for the primary flow.'});
  else for (const state of requiredStates) if (!states.includes(state)) result.findings.push({id: 'BRIEF-009', status: 'BLOCK', severity: 'error', title: `Required state missing: ${state}`, detail: 'The primary flow needs an observable state for this outcome.'});
  result.status = result.findings.length ? 'INVALID' : 'VALID';
  return result;
}

export function qualityAudit(target = '.', {task = null, brief = null} = {}) {
  const absolute = path.resolve(target);
  const root = fs.statSync(absolute).isDirectory() ? absolute : path.dirname(absolute);
  const staticReport = audit(absolute);
  const intent = existsAny(root, intentFiles);
  const contracts = existsAny(root, contractFiles);
  const selected = task ? selectRuleContracts({tasks: task.split(',')}) : null;
  const findings = [];
  const briefReport = brief ? validateBrief(path.resolve(root, brief)) : null;
  if (briefReport?.findings.length) findings.push(...briefReport.findings);

  if (!intent.some(name => /design|ux/i.test(name))) {
    findings.push({id: 'DECISION-001', status: 'NEEDS_INPUT', severity: 'error',
      title: 'Design intent is not declared',
      detail: 'Add DESIGN.md (or UX.md) with user, primary task, non-goals, and consequential actions.'});
  }
  if (!contracts.length) {
    findings.push({id: 'DECISION-002', status: 'NEEDS_INPUT', severity: 'error',
      title: 'No task or interaction contract found',
      detail: 'Declare at least one user task and its observable completion checks before claiming UX success.'});
  }
  if (staticReport.counts.error > 0) {
    findings.push({id: 'DECISION-003', status: 'BLOCK', severity: 'error',
      title: 'Confirmed source-level blockers exist',
      detail: `${staticReport.counts.error} error-level finding(s) require remediation or an explicit exception.`});
  }
  if (staticReport.counts.unverified > 0) {
    findings.push({id: 'DECISION-004', status: 'NOT_VERIFIED', severity: 'warning',
      title: 'Heuristic findings need review',
      detail: `${staticReport.counts.unverified} candidate(s) are not runtime proof.`});
  }
  if (task && selected?.status !== 'SELECTED_NOT_EXECUTED') {
    findings.push({id: 'DECISION-005', status: 'BLOCK', severity: 'error',
      title: 'Rule selection failed', detail: 'The declared task family could not be resolved.'});
  }

  const scannedText = staticReport.scanned_files === 0 ? '' : JSON.stringify(staticReport.findings);
  const status = findings.some(f => f.status === 'BLOCK') ? 'BLOCK' :
    findings.some(f => f.status === 'NEEDS_INPUT') ? 'NEEDS_INPUT' :
    findings.some(f => f.status === 'NOT_VERIFIED') ? 'NOT_VERIFIED' : 'READY_FOR_VERIFICATION';
  return {
    schema_version: '1.0', engine_version: '1.0.0', status, root,
    intent_files: intent, contract_files: contracts,
    selected_rules: selected?.selected_rules ?? [],
    brief: briefReport,
    source_audit: {files: staticReport.scanned_files, counts: staticReport.counts},
    planning_estimate: {audit_result_tokens: countTokens(scannedText), disclaimer: 'Estimate only; not billing or model-token telemetry.'},
    findings
  };
}

export function qualityMarkdown(report) {
  return `# UI/UX Decision Gate\n\nStatus: **${report.status}**  \nFiles scanned: ${report.source_audit.files}  \nPlanning estimate: ${report.planning_estimate.audit_result_tokens} tokens (estimate only)\n\n| Status | ID | Finding | Detail |\n|---|---|---|---|\n${report.findings.map(f => `| ${f.status} | ${f.id} | ${f.title} | ${f.detail.replaceAll('|', '\\|')} |`).join('\n') || '| PASS | — | No decision blockers detected | Evidence still requires execution where applicable. |'}\n`;
}
