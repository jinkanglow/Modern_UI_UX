import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {audit} from '../src/audit.js';
import {sarif} from '../src/sarif.js';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','golden');
test('golden valid HTML does not trigger verified HTML errors',()=>{
 const report=audit(path.join(dir,'valid.html'));
 assert.deepEqual(report.findings.filter(f=>f.status==='FAIL'&&f.severity==='error'),[]);
});
test('golden invalid HTML finds expected confirmed defects',()=>{
 const report=audit(path.join(dir,'invalid.html'));
 for(const id of ['HTML-001','HTML-002','HTML-004','HTML-008'])assert.ok(report.findings.some(f=>f.rule_id===id&&f.status==='FAIL'),`Missing ${id}`);
 assert.ok(report.findings.every(f=>Number.isInteger(f.line)&&Number.isInteger(f.column)&&f.column>0));
});
test('SARIF retains source columns and emits valid result locations',()=>{
 const result=sarif(audit(path.join(dir,'invalid.html')));
 assert.equal(result.version,'2.1.0');
 assert.ok(result.runs[0].results.some(f=>f.locations[0].physicalLocation.region?.startColumn>0));
});
