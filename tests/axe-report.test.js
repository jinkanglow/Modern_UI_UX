import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAxe} from '../src/axe-report.js';
test('axe violations and incomplete checks have different verification states',()=>{
 const mk=(id)=>({id,impact:'serious',help:'Label',nodes:[{target:['#input'],failureSummary:'Check label'}]});
 const r=normalizeAxe({violations:[mk('label')],incomplete:[mk('color-contrast')],passes:[],inapplicable:[]},{url:'http://localhost',browser:'chromium'});
 assert.equal(r.counts.confirmed,1);assert.equal(r.counts.unverified,1);assert.equal(r.findings[0].status,'FAIL');assert.equal(r.findings[1].status,'UNVERIFIED');
});
