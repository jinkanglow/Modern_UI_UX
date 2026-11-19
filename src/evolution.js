import fs from 'node:fs';

const terminalValues = new Set(['success', 'failure', 'abandoned', 'blocked']);

function fail(id, title, detail) {
  return {id, status: 'BLOCK', severity: 'error', title, detail};
}

export function evaluateEvolution(manifest) {
  const findings = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {schema_version: '1.0', status: 'BLOCK', findings: [fail('EVOLVE-001', 'Manifest must be an object', 'Provide a JSON evolution manifest.')]};
  }
  if (manifest.schema_version !== '1.0') findings.push(fail('EVOLVE-002', 'Unsupported manifest version', 'Expected schema_version 1.0.'));
  if (!Array.isArray(manifest.episodes) || manifest.episodes.length === 0) findings.push(fail('EVOLVE-003', 'No episodes supplied', 'Learning requires recorded interaction episodes; do not invent rewards.'));
  const objective = manifest.objective;
  if (!objective || typeof objective !== 'object' || typeof objective.min_improvement !== 'number') findings.push(fail('EVOLVE-004', 'Objective threshold is missing', 'Declare objective.min_improvement explicitly.'));
  const episodes = Array.isArray(manifest.episodes) ? manifest.episodes : [];
  const byAction = new Map();
  for (const [index, episode] of episodes.entries()) {
    if (!episode || typeof episode !== 'object' || typeof episode.id !== 'string' || typeof episode.state !== 'string' || typeof episode.action !== 'string' || typeof episode.reward !== 'number' || !Number.isFinite(episode.reward)) {
      findings.push(fail('EVOLVE-005', 'Invalid episode', `Episode ${index + 1} needs id, state, action, and finite numeric reward.`));
      continue;
    }
    if (episode.terminal !== undefined && !terminalValues.has(episode.terminal)) findings.push(fail('EVOLVE-006', 'Invalid terminal outcome', `Episode ${episode.id} must use success, failure, abandoned, or blocked.`));
    if (episode.evidence_id === undefined) findings.push({id: 'EVOLVE-007', status: 'NOT_VERIFIED', severity: 'warning', title: 'Episode has no evidence link', detail: `Episode ${episode.id} may be used for offline analysis but is not independently verified.`});
    const key = `${episode.state}::${episode.action}`;
    const current = byAction.get(key) ?? {state: episode.state, action: episode.action, count: 0, reward: 0};
    current.count += 1; current.reward += episode.reward; byAction.set(key, current);
  }
  if (findings.some(f => f.status === 'BLOCK')) return {schema_version: '1.0', status: 'BLOCK', findings, policy: manifest.policy_id ?? null};
  const totalReward = episodes.reduce((sum, episode) => sum + (Number.isFinite(episode?.reward) ? episode.reward : 0), 0);
  const safety = manifest.safety ?? {};
  const safetyFailures = Number(safety.blocked ?? 0) + Number(safety.unauthorized ?? 0) + Number(safety.duplicate_side_effect ?? 0);
  const baseline = Number(manifest.baseline?.reward);
  const minimum = Number(objective.min_improvement);
  const comparable = Number.isFinite(baseline) && Number.isFinite(minimum);
  let status = findings.some(f => f.status === 'NOT_VERIFIED') ? 'NOT_VERIFIED' : 'NOT_COMPARABLE';
  if (comparable) {
    const improvement = totalReward - baseline;
    status = improvement >= minimum && safetyFailures === 0 ? 'CANDIDATE_ACCEPTED' : 'CANDIDATE_REJECTED';
    if (safetyFailures > 0) findings.push(fail('EVOLVE-008', 'Safety regression detected', 'A candidate cannot be promoted with blocked, unauthorized, or duplicate side-effect episodes.'));
    if (improvement < minimum) findings.push({id: 'EVOLVE-009', status: 'BLOCK', severity: 'error', title: 'Improvement threshold not met', detail: `Observed improvement ${improvement} is below required ${minimum}.`});
  }
  return {schema_version: '1.0', status, policy: manifest.policy_id ?? null, baseline_policy: manifest.baseline?.policy_id ?? null, metrics: {episodes: episodes.length, total_reward: totalReward, baseline_reward: Number.isFinite(baseline) ? baseline : null, improvement: comparable ? totalReward - baseline : null, safety_failures: safetyFailures}, action_values: [...byAction.values()].map(value => ({...value, mean_reward: value.reward / value.count})), findings};
}

export function readAndEvaluateEvolution(file) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return {schema_version: '1.0', status: 'BLOCK', findings: [fail('EVOLVE-000', 'Manifest cannot be read', error.message)]}; }
  return evaluateEvolution(manifest);
}

export function evolutionMarkdown(report) {
  return `# UI/UX Policy Evolution\n\nStatus: **${report.status}**\n\nEpisodes: ${report.metrics?.episodes ?? 0}  \nTotal reward: ${report.metrics?.total_reward ?? 'n/a'}  \nImprovement: ${report.metrics?.improvement ?? 'not comparable'}\n\n| Status | ID | Finding | Detail |\n|---|---|---|---|\n${(report.findings ?? []).map(f => `| ${f.status} | ${f.id} | ${f.title} | ${f.detail.replaceAll('|', '\\|')} |`).join('\n') || '| PASS | — | No evolution gate findings | Candidate still requires human promotion. |'}\n`;
}
