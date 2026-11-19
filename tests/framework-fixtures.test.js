import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readContract,validateContract} from '../src/interaction.js';
const contract=readContract('examples/frameworks/interaction-contract.json');
test('v2.3 framework contract validates all four behavioral scenarios',()=>{
 assert.deepEqual(validateContract(contract),[]);
 assert.deepEqual(contract.scenarios.map(s=>s.id),['validation-blocks-empty-name','save-no-duplicate','http-error-retry','network-abort-retry']);
});
test('v2.3 framework contract includes empty-form validation, duplicate prevention and recovery',()=>{
 assert.ok(contract.scenarios[0].steps[0].expect.some(e=>e.check==='request_count'&&e.equals===0));
 assert.ok(contract.scenarios[1].steps.some(s=>s.action==='double_click'&&s.expect.some(e=>e.check==='request_count'&&e.equals===1)));
 assert.ok(contract.scenarios[2].routes.some(r=>r.status===503));
 assert.ok(contract.scenarios[3].routes.some(r=>r.mode==='abort'));
});
test('v2.3 React and Vue fixtures have real framework entrypoints and cross-component UI',()=>{
 const react=fs.readFileSync('examples/frameworks/react/src/main.jsx','utf8');
 const vue=fs.readFileSync('examples/frameworks/vue/src/main.js','utf8');
 assert.match(react,/createRoot/);assert.match(react,/function Editor/);assert.match(react,/function Status/);
 assert.match(vue,/createApp/);assert.match(vue,/const Editor=/);assert.match(vue,/const Status=/);
 for(const src of [react,vue]){assert.match(src,/inFlight/);assert.match(src,/response\.ok/);assert.match(src,/Could not save\. Retry available/);}
});
