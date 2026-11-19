import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEvolution} from '../src/evolution.js';

const base = {schema_version: '1.0', policy_id: 'candidate', baseline: {policy_id: 'base', reward: 3}, objective: {min_improvement: 1}, safety: {}, episodes: [{id: '1', state: 'error', action: 'retry', reward: 4, terminal: 'success', evidence_id: 'e1'}]};

test('evolution accepts a measured improvement without safety regression', () => {
  assert.equal(evaluateEvolution(base).status, 'CANDIDATE_ACCEPTED');
});

test('evolution rejects unauthorized or duplicate side effects', () => {
  const report = evaluateEvolution({...base, safety: {unauthorized: 1}});
  assert.equal(report.status, 'CANDIDATE_REJECTED');
  assert.equal(report.findings.some(f => f.id === 'EVOLVE-008'), true);
});

test('evolution does not promote incomparable data', () => {
  const report = evaluateEvolution({...base, baseline: undefined});
  assert.equal(report.status, 'NOT_COMPARABLE');
});
