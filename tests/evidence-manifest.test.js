import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {evidenceManifest,verifyEvidenceManifest,verifyInteraction} from '../src/interaction.js';

test('hash manifest contains no raw screenshot contents or private metadata',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux18-'));
 try{
  const file=path.join(dir,'shot.png');fs.writeFileSync(file,'SECRET_IMAGE_DATA');
  const manifest=evidenceManifest([{scenario:'test',step:2,type:'screenshot',status:'CAPTURED',path:file,private:'SECRET'}]);
  assert.equal(manifest.entries.length,1);
  assert.doesNotMatch(JSON.stringify(manifest),/SECRET|\/tmp\//);
  assert.equal(verifyEvidenceManifest(manifest,dir).counts.intact,1);
  fs.writeFileSync(file,'CHANGED_IMAGE');
  assert.equal(verifyEvidenceManifest(manifest,dir).counts.intact,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('rejects traversal and symlink evidence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uiux18-'));
 try{
  assert.throws(()=>verifyEvidenceManifest({schema_version:'1.8',entries:[{filename:'../secret'}]},dir),/Unsafe/);
  fs.writeFileSync(path.join(dir,'real.png'),'x');fs.symlinkSync('real.png',path.join(dir,'link.png'));
  assert.throws(()=>evidenceManifest([{status:'CAPTURED',path:path.join(dir,'link.png')}]),/regular file/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('rejects evidence filename collisions between scenario IDs',async()=>{
 const contract={schema_version:'1.0',id:'collide',target:'http://localhost',scenarios:[{id:'a/b',steps:[{action:'assert_only',expect:[{check:'visible',selector:'#x'}]}]},{id:'a_b',steps:[{action:'assert_only',expect:[{check:'visible',selector:'#x'}]}]}]};
 const adapter={async open(){},async perform(){},async assert(){},async close(){}};
 await assert.rejects(()=>verifyInteraction(contract,adapter),/collide/);
});
