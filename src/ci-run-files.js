/** Local CI receipt lifecycle. Removes stale outputs before running and writes atomically. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const outputs=['react.json','vue.json','bundle-verification.json'];
export function prepareCiReceiptDirectory(directory){
 fs.mkdirSync(directory,{recursive:true});
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('CI output directory must be a real directory');
 for(const name of outputs){
  const file=path.join(directory,name);
  try{fs.lstatSync(file);fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return directory;
}
export function writeCiJsonAtomic(directory,name,value){
 if(!outputs.includes(name))throw Error('Unsupported CI output filename');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('CI output directory must be a real directory');
 const file=path.join(directory,name);
 const tmp=path.join(directory,`.${name}.${randomUUID()}.tmp`);
 try{
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(tmp,file);
 }finally{try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 return file;
}
