import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const token = /^[a-zA-Z0-9_-]{2,80}$/;
const kinds = new Set(['screenshot','trace','dom-snapshot','manual-note','runtime-report']);
const safeRelative = (root, relative) => {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) throw Error('Invalid relative path');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw Error('Path escapes dataset');
  const parts = path.relative(root, resolved).split(path.sep);
  let at = path.resolve(root);
  for (const part of parts) {
    at = path.join(at, part);
    const stat = fs.lstatSync(at);
    if (stat.isSymbolicLink()) throw Error('Symlinks are forbidden');
  }
  if (!fs.statSync(resolved).isFile()) throw Error('Expected regular file');
  return resolved;
};
const dataset = dir => {
  const root = path.resolve(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schema_version !== '1.3-draft' || !Array.isArray(manifest.cases)) throw Error('Expected v1.3 dataset');
  return {root, manifest};
};
const locate = (manifest, id) => {
  const item = manifest.cases.find(c => c.id === id);
  if (!item) throw Error('Unknown case ID');
  return item;
};
const validLocation = (source, location) => {
  if (location == null) return null;
  const lines = source.toString('utf8').split(/\r?\n/);
  if (!Number.isInteger(location.line) || location.line < 1 || location.line > lines.length) throw Error('Invalid source line');
  if (location.column !== undefined && (!Number.isInteger(location.column) || location.column < 1 || location.column > lines[location.line-1].length + 1)) throw Error('Invalid source column');
  return {line: location.line, ...(location.column === undefined ? {} : {column: location.column})};
};
/** Copy an explicitly supplied artifact into a content-addressed, immutable evidence store. */
export function attachEvidence({datasetDir, caseId, evidenceId, file, kind, scenario, step, location, note}) {
  if (!token.test(evidenceId ?? '')) throw Error('Invalid evidence ID');
  if (!kinds.has(kind)) throw Error('Unsupported evidence kind');
  if (scenario !== undefined && (typeof scenario !== 'string' || scenario.length > 120 || !scenario)) throw Error('Invalid scenario');
  if (step !== undefined && (!Number.isInteger(step) || step < 0)) throw Error('Invalid step');
  if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) throw Error('Invalid note');
  const {root,manifest} = dataset(datasetDir), item = locate(manifest,caseId);
  const source = fs.readFileSync(safeRelative(root,item.file));
  if (hash(source) !== item.sha256) throw Error('Snapshot integrity mismatch');
  const where = validLocation(source,location);
  const input = path.resolve(file);
  const stat = fs.lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024) throw Error('Evidence must be a regular file <=20 MiB');
  const bytes = fs.readFileSync(input), digest = hash(bytes);
  const folder = path.join(root,'evidence',caseId);
  fs.mkdirSync(folder,{recursive:true});
  const recordFile = path.join(folder,`${evidenceId}.json`);
  if (fs.existsSync(recordFile)) throw Error('Evidence ID already exists');
  const payloadFile = path.join(folder,`${evidenceId}.bin`);
  // Use exclusive creation; do not overwrite prior evidence.
  fs.writeFileSync(payloadFile,bytes,{flag:'wx',mode:0o600});
  const record = {schema_version:'1.5-evidence',case_id:caseId,evidence_id:evidenceId,kind,sha256:digest,bytes:bytes.length,snapshot_sha256:item.sha256,artifact:path.relative(root,payloadFile),...(scenario?{scenario}:{}),...(step!==undefined?{step}:{}),...(where?{location:where}:{}),...(note?{note}:{}),verification:'INTEGRITY_ONLY',limitations:['Artifact integrity does not prove the observed behavior, source-to-DOM mapping, or reviewer independence.']};
  try {fs.writeFileSync(recordFile,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch (error) {fs.rmSync(payloadFile,{force:true});throw error;}
  return record;
}
export function checkEvidence(datasetDir) {
  const {root,manifest} = dataset(datasetDir);
  const entries=[];
  for (const item of manifest.cases) {
    const dir=path.join(root,'evidence',item.id);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort()) {
      try {
        const record=JSON.parse(fs.readFileSync(safeRelative(root,path.join('evidence',item.id,name)),'utf8'));
        if (record.schema_version!=='1.5-evidence'||record.case_id!==item.id||record.evidence_id+'.json'!==name||record.snapshot_sha256!==item.sha256) throw Error('Record metadata mismatch');
        const source=fs.readFileSync(safeRelative(root,item.file));
        if(hash(source)!==item.sha256)throw Error('Source snapshot changed');
        validLocation(source,record.location);
        const expected=path.join('evidence',item.id,record.evidence_id+'.bin');
        if(record.artifact!==expected)throw Error('Artifact path mismatch');
        const bytes=fs.readFileSync(safeRelative(root,expected));
        if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error('Evidence integrity mismatch');
        entries.push({case_id:item.id,evidence_id:record.evidence_id,status:'INTACT',kind:record.kind,location:record.location??null});
      } catch(error) {entries.push({case_id:item.id,evidence_id:name.replace(/\.json$/,''),status:'INVALID',reason:error.message});}
    }
  }
  return {schema_version:'1.5-evidence-check',entries,counts:{total:entries.length,intact:entries.filter(x=>x.status==='INTACT').length,invalid:entries.filter(x=>x.status==='INVALID').length},limitations:['Integrity-only verification; no claim of browser truth or source-to-DOM mapping.']};
}
