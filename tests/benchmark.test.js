import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmark} from '../src/benchmark.js';
const manifest=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','behavior','manifest.json');
test('curated benchmark has no false positives or misses for expected call sites',()=>{const result=benchmark(manifest);assert.equal(result.counts.true_positives,4);assert.equal(result.counts.false_positives,0);assert.equal(result.counts.false_negatives,0);assert.equal(result.precision,1);assert.equal(result.recall,1);});
test('benchmark describes its scope and limitations',()=>{const result=benchmark(manifest);assert.match(result.scope,/curated/);assert.ok(result.limitations.length);});
