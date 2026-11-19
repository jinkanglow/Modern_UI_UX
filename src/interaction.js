import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const allowedActions=new Set(['click','fill','press','wait','double_click','assert_only']);
const allowedChecks=new Set(['visible','hidden','enabled','disabled','text','value','count','request_count']);
const allowedStates=new Set(['idle','validating','pending','success','error','unknown']);
const allowedTransitions={idle:new Set(['validating','pending','success','error']),validating:new Set(['pending','error','idle']),pending:new Set(['success','error','unknown']),success:new Set(['idle']),error:new Set(['idle','validating','pending']),unknown:new Set(['idle','pending','success','error'])};
const MAX_STEPS=100,MAX_TIMEOUT=30000;
const MAX_EVIDENCE_BYTES=50*1024*1024;
/** Evidence manifest deliberately excludes browser URL, cookies, DOM text and user inputs. */
export function evidenceManifest(artifacts,{maxBytes=MAX_EVIDENCE_BYTES,dir=null}={}){
 const entries=[];
 for(const a of artifacts){
  if(a.status!=='CAPTURED')continue;
  if(dir&&path.resolve(path.dirname(a.path))!==path.resolve(dir))throw Error('Evidence file is outside the specified directory');
  const stat=fs.lstatSync(a.path);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Evidence must be a regular file');
  if(stat.size>maxBytes)throw Error('Evidence exceeds maximum permitted size');
  const bytes=fs.readFileSync(a.path);
  entries.push({scenario:a.scenario,step:a.step??null,type:a.type,filename:path.basename(a.path),bytes:stat.size,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 return {schema_version:'1.8',entries};
}
export function verifyEvidenceManifest(manifest,dir){
 if(!manifest||manifest.schema_version!=='1.8'||!Array.isArray(manifest.entries))throw Error('Invalid evidence manifest');
 const results=[];
 for(const entry of manifest.entries){
  if(typeof entry.filename!=='string'||!/^[-a-zA-Z0-9_.]+$/.test(entry.filename)||entry.filename==='.'||entry.filename==='..')throw Error('Unsafe evidence filename');
  const file=path.join(dir,entry.filename);
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes||stat.size>MAX_EVIDENCE_BYTES)throw Error('Evidence file invalid');
   const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   results.push({filename:entry.filename,status:hash===entry.sha256?'INTACT':'CHANGED'});
  }catch{results.push({filename:entry.filename,status:'MISSING_OR_INVALID'});}
 }
 return {results,counts:{total:results.length,intact:results.filter(x=>x.status==='INTACT').length}};
}

const MAX_ROUTES=20;
function validRoute(r){return object(r)&&nonempty(r.url)&&r.url.length<=500&&['fulfill','abort'].includes(r.mode)&&(!('status' in r)||(Number.isInteger(r.status)&&r.status>=100&&r.status<=599))&&(!('body' in r)||typeof r.body==='string')&&(!('content_type' in r)||nonempty(r.content_type))&&(!('delay_ms' in r)||(Number.isInteger(r.delay_ms)&&r.delay_ms>=0&&r.delay_ms<=5000))&&(!('abort_reason' in r)||['failed','timedout','internetdisconnected','connectionrefused'].includes(r.abort_reason));}
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function nonempty(x){return typeof x==='string'&&x.trim().length>0;}
function validSelector(x){return nonempty(x)&&x.length<=500;}
function checkTimeout(x){return x===undefined||(Number.isInteger(x)&&x>=1&&x<=MAX_TIMEOUT);}

/** Strictly validate before launching a browser. Never infer missing states or actions. */
export function validateContract(contract){
 const errors=[];
 if(!object(contract))return ['Contract must be a JSON object'];
 if(!['0.7','0.8','0.9','1.0'].includes(contract.schema_version))errors.push('schema_version must be 0.7, 0.8, 0.9 or 1.0');
 if(!nonempty(contract.id))errors.push('id is required');
 if(!nonempty(contract.target))errors.push('target is required');
 if(!Array.isArray(contract.scenarios)||!contract.scenarios.length)errors.push('scenarios must be a nonempty array');
 if(!checkTimeout(contract.timeout_ms))errors.push('timeout_ms must be 1..30000');
 if(contract.routes!==undefined&&(!Array.isArray(contract.routes)||contract.routes.length>MAX_ROUTES||contract.routes.some(r=>!validRoute(r))))errors.push('routes must be up to 20 valid network stubs');
 const ids=new Set();
 for(const [i,s] of (Array.isArray(contract.scenarios)?contract.scenarios:[]).entries()){
  const prefix=`scenarios[${i}]`;
  if(!object(s)){errors.push(`${prefix} must be an object`);continue;}
  if(!nonempty(s.id)||ids.has(s.id))errors.push(`${prefix}.id must be unique and nonempty`);else ids.add(s.id);
  if(s.routes!==undefined&&(!Array.isArray(s.routes)||s.routes.length>MAX_ROUTES||s.routes.some(r=>!validRoute(r))))errors.push(`${prefix}.routes must be up to 20 valid network stubs`);
  if(!Array.isArray(s.steps)||!s.steps.length||s.steps.length>MAX_STEPS){errors.push(`${prefix}.steps must contain 1..${MAX_STEPS} steps`);continue;}
  let previous='idle';
  for(const [j,step] of s.steps.entries()){
   const p=`${prefix}.steps[${j}]`;
   if(!object(step)){errors.push(`${p} must be an object`);continue;}
   if(!allowedActions.has(step.action))errors.push(`${p}.action invalid`);
   if(!['wait','assert_only'].includes(step.action)&&!validSelector(step.selector))errors.push(`${p}.selector required`);
   if(step.action==='wait'&&(!Number.isInteger(step.ms)||step.ms<0||step.ms>5000))errors.push(`${p}.ms must be 0..5000`);
   if(step.action==='fill'&&!('value' in step))errors.push(`${p}.value required`);
   if(step.action==='fill'&&!['string','number','boolean'].includes(typeof step.value))errors.push(`${p}.value must be string, number or boolean`);
   if(step.action==='double_click'&&!['0.8','0.9','1.0'].includes(contract.schema_version))errors.push(`${p}.double_click requires schema_version 0.8`);
   if(step.action==='assert_only'&&contract.schema_version!=='1.0')errors.push(`${p}.assert_only requires schema_version 1.0`);
   if(step.action==='press'&&!nonempty(step.key))errors.push(`${p}.key required`);
   if(!checkTimeout(step.timeout_ms))errors.push(`${p}.timeout_ms must be 1..30000`);
   if(step.state!==undefined){
    if(!allowedStates.has(step.state))errors.push(`${p}.state invalid`);
    else if(step.state!==previous&&!allowedTransitions[previous]?.has(step.state))errors.push(`${p}.state transition ${previous} -> ${step.state} is not allowed`);
    if(allowedStates.has(step.state))previous=step.state;
   }
   if(!Array.isArray(step.expect)||!step.expect.length)errors.push(`${p}.expect must be a nonempty array`);
   for(const [k,assertion] of (Array.isArray(step.expect)?step.expect:[]).entries()){
    const q=`${p}.expect[${k}]`;
    if(!object(assertion)||!allowedChecks.has(assertion.check)||!(assertion.check==='request_count'?nonempty(assertion.url):validSelector(assertion.selector)))errors.push(`${q} requires supported check and selector/url`);
    else if(['text','value'].includes(assertion.check)&&typeof assertion.equals!=='string')errors.push(`${q}.equals must be a string`);
    else if(['count','request_count'].includes(assertion.check)&&(!Number.isInteger(assertion.equals)||assertion.equals<0))errors.push(`${q}.equals must be a nonnegative integer`);
    if(object(assertion)&&assertion.check==='request_count'&&!['0.8','0.9','1.0'].includes(contract.schema_version))errors.push(`${q}.request_count requires schema_version 0.8`);
    if(object(assertion)&&assertion.settle_ms!==undefined&&(!Number.isInteger(assertion.settle_ms)||assertion.settle_ms<0||assertion.settle_ms>5000||assertion.check!=='request_count'))errors.push(`${q}.settle_ms requires request_count and must be 0..5000`);
    if(object(assertion)&&!checkTimeout(assertion.timeout_ms))errors.push(`${q}.timeout_ms must be 1..30000`);
   }
  }
 }
 return errors;
}

/** Adapter API: open(target), perform(step,timeout), assert(assertion,timeout), close(). */
export async function verifyInteraction(contract,adapter,{timeout_ms,evidence_dir=null,trace_on_success=false,observation_policy=null}={}){
 const errors=validateContract(contract);if(errors.length)throw new Error(`Invalid interaction contract:\n${errors.join('\n')}`);
 const timeout=timeout_ms??contract.timeout_ms??5000;
 if(!checkTimeout(timeout))throw new Error('Invalid timeout');
 const findings=[],scenarios=[],artifacts=[];
 const monotonic=()=>Number(process.hrtime.bigint()/1000000n);
 if(evidence_dir){fs.mkdirSync(evidence_dir,{recursive:true});}
 const scenarioNames=new Set();
 for(const scenario of contract.scenarios){const safe=safeName(scenario.id);if(scenarioNames.has(safe))throw Error('Scenario IDs collide after filename normalization');scenarioNames.add(safe);}
 try{
  for(const scenario of contract.scenarios){
   const steps=[];let blocked=false;const scenarioOrigin=monotonic();
   const observationSpec=observation_policy?.scenarios?.find(s=>s.id===scenario.id);
   try{await adapter.open(contract.target,{routes:scenario.routes??contract.routes??[],observe:observationSpec??null});}catch(e){
    findings.push(finding(scenario.id,0,'NAVIGATION_FAILED',String(e.message??e)));blocked=true;
    if(evidence_dir)artifacts.push(...await captureSafely(adapter,evidence_dir,scenario.id,0));
   }
   if(!blocked)for(const [index,step] of scenario.steps.entries()){
    try{
     await adapter.perform(step,step.timeout_ms??timeout);
     const checks=[];
     for(const assertion of step.expect){
      try{const started=monotonic()-scenarioOrigin;await adapter.assert(assertion,assertion.timeout_ms??timeout);checks.push({check:assertion.check,status:'PASS',timing:{start_ms:started,end_ms:monotonic()-scenarioOrigin}});}
      catch(e){checks.push({check:assertion.check,status:'FAIL'});findings.push(finding(scenario.id,index+1,'ASSERTION_FAILED',String(e.message??e),assertion.selector??assertion.url));
       if(evidence_dir)artifacts.push(...await captureSafely(adapter,evidence_dir,scenario.id,index+1));
       await observeSafely(adapter,findings.at(-1),assertion.selector??null);}
     }
     steps.push({index:index+1,action:step.action,state:step.state??null,status:checks.every(x=>x.status==='PASS')?'PASS':'FAIL',checks});
     if(checks.some(x=>x.status==='FAIL'))break;
    }catch(e){
     findings.push(finding(scenario.id,index+1,'ACTION_FAILED',String(e.message??e),step.selector));
     if(evidence_dir)artifacts.push(...await captureSafely(adapter,evidence_dir,scenario.id,index+1));
     await observeSafely(adapter,findings.at(-1),step.selector??null);
     steps.push({index:index+1,action:step.action,state:step.state??null,status:'FAIL',checks:[]});break;
    }
   }
   let observation=null;
   if(observationSpec&&typeof adapter.collectObservation==='function'){try{observation=await adapter.collectObservation();}catch{observation={status:'UNVERIFIED'};}}
   scenarios.push({id:scenario.id,status:blocked||steps.some(x=>x.status==='FAIL')?'FAIL':'PASS',steps,...(observationSpec?{observation:observation??{status:'UNVERIFIED'}}:{})});
   if(evidence_dir&&typeof adapter.finishScenario==='function'){try{const a=await adapter.finishScenario(evidence_dir,scenario.id,{save:trace_on_success||blocked||steps.some(x=>x.status==='FAIL')});if(a)artifacts.push(a);}catch(e){artifacts.push({scenario:scenario.id,type:'trace',status:'UNVERIFIED',reason:String(e.message??e)});}}
  }
 }finally{await adapter.close();}
 return {schema_version:contract.schema_version,engine_version:'2.2.0',contract_sha256:contractFingerprint(contract),mode:'interaction',target:contract.target,contract_id:contract.id,scenarios,findings,artifacts,counts:{scenarios:scenarios.length,passed:scenarios.filter(s=>s.status==='PASS').length,failed:scenarios.filter(s=>s.status==='FAIL').length},limitations:['Only explicitly declared scenarios and assertions were exercised.','PASS is not proof of overall UX quality, accessibility compliance, or untested recovery behavior.','State names describe contract expectations; actual application state is observed only through explicit DOM assertions.','Request counts are scoped to each scenario; network mocks are controlled test inputs, not real outage proof.','Network stubs are deterministic test doubles, not evidence of actual production backend behavior.','DOM observations contain only tag names and match counts; source mappings are never inferred from selectors.','Screenshots and traces may contain personal data. Evidence is opt-in; successful traces are discarded by default.']};
}
/** Observation metadata is structural only: no DOM text, input values, HTML or page URLs. */
async function observeSafely(adapter,entry,selector){
 if(!selector){entry.dom_observation={status:'NOT_APPLICABLE',reason:'No element selector for this failure'};return;}
 if(typeof adapter.observe!=='function'){entry.dom_observation={status:'UNVERIFIED',reason:'Adapter does not expose DOM observations'};return;}
 try{
  const result=await adapter.observe(selector);
  if(!result||typeof result!=='object'||!['OBSERVED','NOT_FOUND','UNVERIFIED'].includes(result.status))throw Error('Invalid DOM observation');
  entry.dom_observation={status:result.status,match_count:Number.isInteger(result.match_count)?result.match_count:null,tag_name:typeof result.tag_name==='string'?result.tag_name:null,source_mapping:result.source_mapping??{status:'UNVERIFIED',method:'none'}};
 }catch{entry.dom_observation={status:'UNVERIFIED',reason:'DOM observation could not be collected'};}
}
async function captureSafely(adapter,dir,scenario,step){if(typeof adapter.capture!=='function')return [{scenario,step,type:'screenshot',status:'UNVERIFIED',reason:'Adapter does not support evidence capture'}];try{const artifact=await adapter.capture(dir,scenario,step);return artifact?[artifact]:[];}catch(e){return [{scenario,step,type:'screenshot',status:'UNVERIFIED',reason:String(e.message??e)}];}}
function safeName(s){return String(s).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64)||'scenario';}
function finding(scenario,step,kind,message,selector=null){return {rule_id:`FLOW-${kind}`,severity:'error',status:'FAIL',scenario,step,selector,evidence:message,verification_method:'browser-contract',autofix:false};}

/** One fresh browser context per scenario: no cookies, localStorage, routes, or request counters leak. */
export async function playwrightAdapter(browser='chromium', {executablePath, captureTrace=false}={}){
 if(!['chromium','firefox','webkit'].includes(browser))throw new Error('Invalid browser');
 let pw;try{pw=await import(process.env.UIUX_PLAYWRIGHT_MODULE||'playwright');}catch{throw new Error('Interaction verification requires Playwright: npm install -D playwright && npx playwright install chromium');}
 const launchOptions={headless:true};if(executablePath||process.env.UIUX_CHROMIUM_EXECUTABLE)launchOptions.executablePath=executablePath||process.env.UIUX_CHROMIUM_EXECUTABLE;
 const instance=await pw[browser].launch(launchOptions);
 let context=null,page=null;let requests=[];let traceActive=false;let observationRequests=[];let observationOrigin=0;let observationSpec=null;let requestIds=new WeakMap();let requestCounter=0;let networkOverflow=false;
 return {
  async open(target,{routes=[],observe=null}={}){
   if(context){if(traceActive){await context.tracing.stop();traceActive=false;}await context.close();}
   context=await instance.newContext();page=await context.newPage();requests=[];
   observationSpec=observe;observationRequests=[];observationOrigin=performance.now();requestIds=new WeakMap();requestCounter=0;networkOverflow=false;
   const recordNetwork=(event)=>{if(observationRequests.length>=512)networkOverflow=true;else observationRequests.push(event);};
   if(observe){
    await context.addInitScript(({selector})=>{
     const MAX=512;const buffer={events:[],overflow:false,navigation_gap:false};
     Object.defineProperty(window,'__uiux_observer',{value:buffer,configurable:false});
     const origin=performance.now();let previous=null;
     function scan(){const el=document.querySelector(selector);const state=el?.getAttribute('data-ux-state');if(state&&state!==previous){previous=state;if(buffer.events.length>=MAX)buffer.overflow=true;else buffer.events.push({state,at_ms:Math.max(0,performance.now()-origin)});}}
     const start=()=>{scan();new MutationObserver(scan).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-ux-state'],childList:true});};
     if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
    },{selector:observe.selector});
   }
   if(captureTrace&&typeof context.tracing?.start==='function'){await context.tracing.start({screenshots:true,snapshots:true});traceActive=true;}
   page.on('request',request=>{requests.push(request.url());if(observationSpec){const id=++requestCounter;requestIds.set(request,id);if(matchesObservedPath(request.url(),observationSpec.network_url))recordNetwork({id,kind:'request',matched:true,at_ms:performance.now()-observationOrigin});}});
   page.on('response',response=>{const id=requestIds.get(response.request());if(id&&observationSpec&&matchesObservedPath(response.url(),observationSpec.network_url))recordNetwork({id,kind:'response',status:response.status(),at_ms:performance.now()-observationOrigin});});
   page.on('requestfailed',request=>{const id=requestIds.get(request);if(id&&observationSpec&&matchesObservedPath(request.url(),observationSpec.network_url))recordNetwork({id,kind:'failed',failure_text:request.failure()?.errorText??null,at_ms:performance.now()-observationOrigin});});
   for(const route of routes){
    await page.route(route.url,async handler=>{
     if(route.delay_ms)await new Promise(resolve=>setTimeout(resolve,route.delay_ms));
     if(route.mode==='abort')await handler.abort(route.abort_reason??'failed');
     else await handler.fulfill({status:route.status??200,contentType:route.content_type??'application/json',body:route.body??'{}'});
    });
   }
   const url=/^https?:\/\//i.test(target)?target:pathToFileURL(path.resolve(target)).href;
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  },
  async collectObservation(){
   if(!observationSpec||!page)return {status:'UNVERIFIED'};
   try{const dom=await page.evaluate(()=>window.__uiux_observer??null);
    if(!dom)return {status:'UNVERIFIED'};
    return {status:'CAPTURED',events:dom.events,overflow:dom.overflow,navigation_gap:dom.navigation_gap,requests:observationRequests.slice(0,512),network_overflow:networkOverflow};
   }catch{return {status:'UNVERIFIED'};}
  },
  async perform(step,timeout){if(step.action==='assert_only')return;if(step.action==='wait'){await page.waitForTimeout(step.ms);return;}const loc=page.locator(step.selector);if(step.action==='click')await loc.click({timeout});else if(step.action==='double_click'){await loc.click({timeout});if(await loc.isEnabled())await loc.click({timeout});}else if(step.action==='fill')await loc.fill(String(step.value),{timeout});else if(step.action==='press')await loc.press(step.key,{timeout});},
  async assert(check,timeout){
   const loc=check.check==='request_count'?null:page.locator(check.selector);
   const poll=async(fn)=>{const deadline=Date.now()+timeout;let last;do{try{if(await fn())return;}catch(e){last=e;}await page.waitForTimeout(50);}while(Date.now()<deadline);throw new Error(`Expected ${check.check} at ${check.selector??check.url}${check.equals!==undefined?` = ${JSON.stringify(check.equals)}`:''}${last?`; ${last.message}`:''}`);};
   await poll(async()=>{switch(check.check){case 'visible':return loc.isVisible();case 'hidden':return !(await loc.isVisible());case 'enabled':return loc.isEnabled();case 'disabled':return !(await loc.isEnabled());case 'text':return (await loc.textContent())?.trim()===check.equals;case 'value':return await loc.inputValue()===check.equals;case 'count':return await loc.count()===check.equals;case 'request_count':return requests.filter(url=>globMatch(check.url,url)).length===check.equals;default:return false;}});
   if(check.check==='request_count'&&check.settle_ms){await page.waitForTimeout(check.settle_ms);const count=requests.filter(url=>globMatch(check.url,url)).length;if(count!==check.equals)throw new Error(`Request count changed during settle window: expected ${check.equals}, observed ${count}`);}
  },
  async observe(selector){
   if(!page)return {status:'UNVERIFIED',source_mapping:{status:'UNVERIFIED',method:'none'}};
   const locator=page.locator(selector);const count=await locator.count();
   if(count===0)return {status:'NOT_FOUND',match_count:0,source_mapping:{status:'UNVERIFIED',method:'none'}};
   if(count>1)return {status:'OBSERVED',match_count:count,source_mapping:{status:'UNVERIFIED',method:'none'}};
   const tag=await locator.evaluate(el=>el.tagName.toLowerCase());
   // No source map is inferred from runtime DOM. Devtool transforms can break mappings.
   return {status:'OBSERVED',match_count:1,tag_name:tag,source_mapping:{status:'UNVERIFIED',method:'none'}};
  },
  async capture(dir,scenario,step){if(!page)throw Error('Page not initialized');const filename=`${safeName(scenario)}-step-${step}.png`;const target=path.join(dir,filename);if(fs.existsSync(target))throw Error('Evidence destination already exists');await page.screenshot({path:target,fullPage:true,timeout:5000});return {scenario,step,type:'screenshot',status:'CAPTURED',path:target};},
  async finishScenario(dir,scenario,{save=true}={}){if(!traceActive)return null;if(!save){await context.tracing.stop();traceActive=false;return null;}const target=path.join(dir,`${safeName(scenario)}.trace.zip`);if(fs.existsSync(target))throw Error('Evidence destination already exists');await context.tracing.stop({path:target});traceActive=false;return {scenario,type:'trace',status:'CAPTURED',path:target};},
  async close(){try{if(context){if(traceActive){await context.tracing.stop();traceActive=false;}await context.close();}}finally{await instance.close();}}
 };
}
export function contractFingerprint(contract){
 const normalized=JSON.stringify(contract);
 return crypto.createHash('sha256').update(normalized).digest('hex');
}
export function readContract(file){const c=JSON.parse(fs.readFileSync(file,'utf8'));const errors=validateContract(c);if(errors.length)throw new Error(`Invalid interaction contract:\n${errors.join('\n')}`);if(!/^https?:\/\//i.test(c.target))c.target=path.resolve(path.dirname(path.resolve(file)),c.target);return c;}

function globMatch(pattern,url){const escaped=pattern.split('*').map(part=>part.replace(/[|\\{}()[\]^$+?.]/g,'\\$&')).join('.*');return new RegExp('^'+escaped+'$').test(url);}

function matchesObservedPath(url,pattern){if(!pattern)return false;try{return new URL(url).pathname===pattern.slice(3);}catch{return false;}}
