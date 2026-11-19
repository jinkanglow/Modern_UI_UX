/** Offline browser-test readiness check. Does not launch a browser or certify execution. */
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const packages=['typescript','playwright','vite','react','react-dom','vue'];
export function doctor({resolvePackage=(name)=>require.resolve(`${name}/package.json`),fileExists=existsSync,browserExecutable=null}={}){
 const checks=packages.map(name=>{
  try{const location=resolvePackage(name);return {id:`package:${name}`,status:'READY',location:undefined};}
  catch{return {id:`package:${name}`,status:'MISSING',remediation:`npm install --no-audit --no-fund`};}
 });
 const playwrightReady=checks.find(c=>c.id==='package:playwright').status==='READY';
 let browser='NOT_CHECKED';
 if(playwrightReady){
  try{
   const executable=browserExecutable??require('playwright').chromium.executablePath();
   browser=fileExists(resolve(executable))?'READY':'MISSING';
  }catch{browser='MISSING';}
 }
 checks.push({id:'browser:chromium',status:browser,...(browser==='MISSING'?{remediation:'npx playwright install chromium'}:{})});
 const ready=checks.every(c=>c.status==='READY');
 return {schema_version:'1.0',engine_version:'2.9.0',status:ready?'READY':'BLOCKED',checks,limitations:['Readiness only: no browser launched, no React/Vue test executed, and no execution provenance established.','Package resolution and executable presence do not guarantee successful launch or network connectivity.']};
}
