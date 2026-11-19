import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {qualityAudit} from '../src/quality.js';

function fixture(name, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiux-quality-'));
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  return {dir, file: path.join(dir, name)};
}

const valid = {
  primary_actor: 'Analyst', user_goal: 'Decide', primary_scenario: 'Review evidence',
  completion_condition: 'Decision saved',
  ai_policy: {may_suggest: true, may_execute: false, must_show: ['uncertainty'], must_support: ['edit', 'retry']},
  verification: {required_states: ['idle', 'loading', 'result', 'error']}
};

test('quality accepts a complete AI brief', () => {
  const {dir, file} = fixture('brief.json', valid);
  const report = qualityAudit(dir, {brief: file});
  assert.equal(report.brief.status, 'VALID');
  assert.equal(report.findings.some(f => f.id.startsWith('BRIEF-')), false);
});

test('quality blocks executable AI without authorization', () => {
  const {dir, file} = fixture('brief.json', {...valid, ai_policy: {...valid.ai_policy, may_execute: true}});
  const report = qualityAudit(dir, {brief: file});
  assert.equal(report.brief.status, 'INVALID');
  assert.equal(report.findings.some(f => f.id === 'BRIEF-006'), true);
});

test('quality blocks missing recovery-oriented states', () => {
  const {dir, file} = fixture('brief.json', {...valid, verification: {required_states: ['idle', 'result']}});
  const report = qualityAudit(dir, {brief: file});
  assert.equal(report.findings.some(f => f.id === 'BRIEF-009'), true);
});
