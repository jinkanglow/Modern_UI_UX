import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixtureServer} from './support/fixture-server.js';
import {readContract,validateContract} from '../src/interaction.js';
test('loopback fixture server serves HTML and responds to POST',async()=>{
 const s=await startFixtureServer();
 try{
  assert.match(s.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  const page=await fetch(`${s.origin}/network.html`);
  assert.equal(page.status,200);assert.match(await page.text(),/id="save"/);
  const response=await fetch(`${s.origin}/api/save`,{method:'POST'});
  assert.equal(response.status,200);
  assert.equal((await fetch(`${s.origin}/missing`)).status,404);
 }finally{await s.close();}
});
test('network contract validates against loopback fixture and uses matching route URLs',()=>{
 const contract=readContract('examples/interaction/network-contract.json');
 assert.deepEqual(validateContract(contract),[]);
 assert.ok(contract.scenarios.every(s=>s.routes.every(r=>r.url==='**/api/save')));
});
