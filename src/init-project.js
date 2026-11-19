import fs from 'node:fs';
import path from 'node:path';

const files = {
  'DESIGN.md': `# Project UI/UX intent\n\nStatus: UNSPECIFIED\n\n- Primary user/role: UNSPECIFIED\n- User goal: UNSPECIFIED\n- Primary scenario: UNSPECIFIED\n- Non-goals: UNSPECIFIED\n- Information priority: UNSPECIFIED\n- Forbidden patterns: UNSPECIFIED\n\nDo not claim this project follows a design standard until these fields are replaced and reviewed.\n`,
  'uiux.config.json': JSON.stringify({schema_version: '1.0', policy_version: '1.0', audit: {fail_on: 'error', exclude: ['node_modules', '.git', 'dist', 'build', 'coverage'], max_file_bytes: 1048576}, enforcement: {required: ['design', 'brief', 'interaction', 'tasks', 'state_policy'], fail_closed: true, evidence_dir: 'artifacts/uiux'}}, null, 2) + '\n',
  'ai-ux-brief.json': JSON.stringify({schema_version: '1.0', primary_actor: 'UNSPECIFIED', user_goal: 'UNSPECIFIED', primary_scenario: 'UNSPECIFIED', completion_condition: 'UNSPECIFIED', ai_policy: {operation_class: 'suggest', may_suggest: false, may_execute: false, must_show: ['UNSPECIFIED'], must_support: ['UNSPECIFIED']}, verification: {required_states: ['idle', 'result', 'error']}}, null, 2) + '\n',
  'interaction.json': JSON.stringify({schema_version: '0.8', id: 'project-primary-flow', target: 'UNSPECIFIED', scenarios: [{id: 'primary-flow', steps: [{action: 'wait', ms: 0, state: 'unknown', expect: [{check: 'visible', selector: '[data-ux-state]'}]}]}]}, null, 2) + '\n',
  'tasks.json': JSON.stringify({schema_version: '1.0', tasks: [{id: 'primary-task', goal: 'UNSPECIFIED', required_scenarios: ['primary-flow'], completion: 'UNSPECIFIED'}]}, null, 2) + '\n',
  'state-policy.json': JSON.stringify({schema_version: '1.0', states: ['idle', 'loading', 'result', 'error'], transitions: [], required_evidence: {state_attribute: 'data-ux-state'}}, null, 2) + '\n'
};

function detect(root) {
  const packageFile = path.join(root, 'package.json');
  if (!fs.existsSync(packageFile)) return {framework: 'unknown', package_manager: 'unknown'};
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const deps = {...pkg.dependencies, ...pkg.devDependencies};
  const framework = deps.react ? 'react' : deps.vue ? 'vue' : deps.svelte ? 'svelte' : deps.next ? 'next' : 'unknown';
  const manager = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm' : 'unknown';
  return {framework, package_manager: manager, scripts: Object.keys(pkg.scripts ?? {})};
}

export function initProject(target = '.', {ci = false, agent = false} = {}) {
  const root = path.resolve(target);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Error(`Project directory not found: ${target}`);
  const created = [], skipped = [];
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) skipped.push(name);
    else { fs.writeFileSync(file, content); created.push(name); }
  }
  if (agent) {
    const file = path.join(root, 'AGENTS.md');
    const content = `# UI/UX project policy\n\nBefore changing UI behavior, read DESIGN.md, ai-ux-brief.json, interaction.json, tasks.json, and state-policy.json. Run \\`uiux quality . --brief ai-ux-brief.json\\` before claiming quality, and run the declared browser assurance contract for runtime claims. Report NOT_VERIFIED instead of guessing.\n`;
    if (fs.existsSync(file)) skipped.push('AGENTS.md'); else { fs.writeFileSync(file, content); created.push('AGENTS.md'); }
  }
  if (ci) {
    const workflow = path.join(root, '.github', 'workflows', 'uiux.yml');
    const content = `name: UIUX\non: [push, pull_request]\njobs:\n  quality:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: node src/cli.js quality . --brief ai-ux-brief.json --task form,feedback,recovery --format markdown\n`;
    if (fs.existsSync(workflow)) skipped.push('.github/workflows/uiux.yml'); else { fs.mkdirSync(path.dirname(workflow), {recursive: true}); fs.writeFileSync(workflow, content); created.push('.github/workflows/uiux.yml'); }
  }
  return {schema_version: '1.0', status: created.length ? 'INITIALIZED' : 'ALREADY_INITIALIZED', root, detected: detect(root), created, skipped, limitations: ['Templates contain UNSPECIFIED values and do not infer product requirements.', 'CI workflow assumes this CLI is available in the checked-out project.']};
}
