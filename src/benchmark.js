import fs from 'node:fs';
import path from 'node:path';
import {audit} from './audit.js';
/** Fixture-level microbenchmark; only declared expected rule IDs are evaluated. */
export function benchmark(manifestPath){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!Array.isArray(manifest.cases)||!manifest.cases.length)throw Error('Benchmark manifest requires nonempty cases');
  const base=path.dirname(path.resolve(manifestPath));
  const cases=[];let tp=0,fp=0,fn=0;
  for(const item of manifest.cases){
    if(!item||typeof item.file!=='string'||!Array.isArray(item.expected)||item.expected.some(x=>typeof x!=='string'))throw Error('Invalid benchmark case');
    const file=path.resolve(base,item.file);
    if(!file.startsWith(base+path.sep))throw Error('Benchmark case must be inside manifest directory');
    const actual=[...new Set(audit(file).findings.map(x=>x.rule_id).filter(x=>x.startsWith('JS-')&&x!=='JS-004'))];
    const expected=[...new Set(item.expected)];
    const truePositives=actual.filter(x=>expected.includes(x));
    const falsePositives=actual.filter(x=>!expected.includes(x));
    const falseNegatives=expected.filter(x=>!actual.includes(x));
    tp+=truePositives.length;fp+=falsePositives.length;fn+=falseNegatives.length;
    cases.push({file:item.file,expected,actual,true_positives:truePositives,false_positives:falsePositives,false_negatives:falseNegatives});
  }
  return {schema_version:'0.6',scope:'curated JS/TS syntax fixture rule-ID detection only',cases,counts:{true_positives:tp,false_positives:fp,false_negatives:fn},precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,limitations:['Fixture-level rule-ID precision/recall is not production precision/recall.','Only JS call-site rule IDs in the manifest are evaluated; no browser or user-task testing.']};
}
