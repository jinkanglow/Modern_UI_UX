import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNetworkOutcome,auditNetworkOutcomes} from '../src/network-outcomes-v44.js';
for(const [name,event,category] of [
 ['success',{kind:'response',status:200},'HTTP_RESPONSE'],
 ['server error',{kind:'response',status:503},'HTTP_ERROR'],
 ['timeout',{kind:'failed',failure_text:'net::ERR_TIMED_OUT'},'TIMEOUT'],
 ['abort',{kind:'failed',failure_text:'net::ERR_ABORTED'},'ABORTED_UNKNOWN_ACTOR'],
 ['explicit signal',{kind:'failed',cancel_signal:true,failure_text:'net::ERR_ABORTED'},'CANCEL_REQUESTED'],
 ['dns failure',{kind:'failed',failure_text:'net::ERR_NAME_NOT_RESOLVED'},'NETWORK_FAILURE'],
 ['unexplained failure',{kind:'failed'},'NETWORK_FAILURE_UNCLASSIFIED'],
 ['invalid response',{kind:'response',status:900},'UNKNOWN'],
 ['unknown event',{kind:'request'},'UNKNOWN']
])test(`classifies ${name}`,()=>assert.equal(classifyNetworkOutcome(event).category,category));
test('abort without cancel signal never claims user cancellation',()=>assert.notEqual(classifyNetworkOutcome({kind:'failed',failure_text:'net::ERR_ABORTED'}).category,'CANCEL_REQUESTED'));
test('missing observation remains unverified',()=>assert.equal(auditNetworkOutcomes({scenarios:[{id:'s'}]}).status,'NOT_VERIFIED'));
test('captured outcome is classified',()=>assert.equal(auditNetworkOutcomes({scenarios:[{id:'s',observation:{status:'CAPTURED',requests:[{id:1,kind:'request'},{id:1,kind:'response',status:200}]}}]}).status,'CLASSIFIED'));
test('overflow prevents classified gate',()=>assert.equal(auditNetworkOutcomes({scenarios:[{id:'s',observation:{status:'CAPTURED',network_overflow:true,requests:[{id:1,kind:'response',status:200}]}}]}).status,'NOT_VERIFIED'));
