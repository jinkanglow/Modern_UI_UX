import fs from 'node:fs';
import path from 'node:path';
import {rules} from './rules.js';
import {loadConfig} from './config.js';
import {analyzeHtml} from './html-analysis.js';
import {analyzeJsx} from './jsx-analysis.js';
import {analyzeBehavior} from './behavior-analysis.js';
const extOK = new Set(['.html','.htm','.css','.jsx','.tsx','.js','.ts']);
const skip = new Set(['node_modules','.git','dist','build','coverage','.next']);
function walk(root, found=[], exclude=skip, maxBytes=1048576) {
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if(entry.isSymbolicLink()) continue;
    const full=path.join(root,entry.name);
    if(entry.isDirectory() && !exclude.has(entry.name)) walk(full,found,exclude,maxBytes);
    else if(entry.isFile() && extOK.has(path.extname(entry.name)) && fs.statSync(full).size <= maxBytes) found.push(full);
  }
  return found;
}
function lineOf(src,index){return src.slice(0,index).split('\n').length;}
function matches(src,regex){return [...src.matchAll(regex)].map(m=>({index:m.index,text:m[0]}));}
function attrs(tag){const a={}; for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g)) a[m[1].toLowerCase()]=m[2]??m[3]??m[4]; return a;}
function scan(src,ext){
  const hits=[]; const add=(id,idx,detail)=>hits.push({id,index:idx,detail});
  const html=['.html','.htm','.jsx','.tsx'].includes(ext);
  if(html){
    for(const m of matches(src,/<img\b[^>]*>/gi)) if(!/\balt\s*=/i.test(m.text)) add('HTML-001',m.index,'img missing alt');
    if(['.html','.htm'].includes(ext)){
      if(/<html\b/i.test(src)&&!/<html\b[^>]*\blang\s*=/i.test(src)) add('HTML-002',0,'html missing lang');
      if(!/<title\b[^>]*>\s*\S[\s\S]*?<\/title>/i.test(src)) add('HTML-005',0,'missing nonempty title');
      if(!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(src)) add('HTML-006',0,'missing viewport meta');
    }
    for(const m of matches(src,/<button\b[^>]*>\s*<\/button\s*>/gi)) if(!/aria-label\s*=|title\s*=/.test(m.text)) add('HTML-003',m.index,'empty button');
    for(const m of matches(src,/<input\b[^>]*>/gi)){
      const a=attrs(m.text); if(a.type==='hidden')continue;
      if(!a['aria-label']&&!a['aria-labelledby']&&!a.id&&!/\btitle\s*=/.test(m.text)) add('HTML-004',m.index,'input without accessible name association');
      if(!a.name) add('HTML-015',m.index,'input missing name (may be intentional for controlled UI)');
    }
    for(const m of matches(src,/<a\b[^>]*>\s*<\/a\s*>/gi)) if(!/aria-label\s*=/.test(m.text)) add('HTML-007',m.index,'empty link');
    const ids=new Map();for(const m of matches(src,/\bid\s*=\s*["'][^"']+["']/gi)){const id=m.text.split(/["']/)[1];if(ids.has(id))add('HTML-008',m.index,`duplicate id ${id}`);else ids.set(id,true);}
    for(const m of matches(src,/\btabindex\s*=\s*["']?[1-9]\d*/gi))add('HTML-009',m.index,'positive tabindex');
    for(const m of matches(src,/\bautofocus\b/gi))add('HTML-010',m.index,'autofocus');
    for(const m of matches(src,/<(?:button|a)\b[^>]*>[\s\S]{0,400}?<(?:button|a)\b/gi))add('HTML-011',m.index,'possible nested interactive element; verify DOM');
    for(const m of matches(src,/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi))if(!/rel\s*=\s*["'][^"']*noopener/.test(m.text))add('HTML-012',m.index,'blank target missing noopener (modern browsers imply it)');
    for(const m of matches(src,/<iframe\b[^>]*>/gi))if(!/\btitle\s*=/.test(m.text))add('HTML-013',m.index,'iframe missing title');
    for(const m of matches(src,/<div\b[^>]*\bonclick\s*=/gi))add('HTML-014',m.index,'clickable div; check keyboard support');
  }
  if(ext==='.css'){
    for(const m of matches(src,/outline\s*:\s*(?:none|0)(?:\s|;|!)/gi))add('CSS-001',m.index,'focus outline removed; check replacement');
    if(/(?:animation\s*:|transition\s*:)/i.test(src)&&!/@media\s*\(\s*prefers-reduced-motion\s*:/i.test(src))add('CSS-002',0,'motion present without local reduced-motion query; global handling may exist');
    for(const m of matches(src,/width\s*:\s*(?:[7-9]\d\d|[1-9]\d{3,})px/gi))add('CSS-003',m.index,'large fixed width; check breakpoint behavior');
    for(const m of matches(src,/!important\b/gi))add('CSS-004',m.index,'important declaration');
    for(const m of matches(src,/(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden/gi))add('CSS-005',m.index,'horizontal overflow hidden');
  }
  if(['.js','.jsx','.ts','.tsx'].includes(ext)){
    for(const [id,re] of [['JS-001',/\b(?:window\.)?alert\s*\(/g],['JS-002',/\b(?:window\.)?confirm\s*\(/g],['JS-003',/\b(?:window\.)?prompt\s*\(/g],['JS-005',/\bdocument\.write\s*\(/g]])for(const m of matches(src,re))add(id,m.index,'potential UX anti-pattern; review usage');
  }
  for(const m of matches(src,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?\b/gi))add('JS-004',m.index,'viewport zoom restriction');
  return hits;
}
export function audit(root){
 const abs=path.resolve(root);if(!fs.existsSync(abs))throw new Error(`Path not found: ${root}`);
 const config=loadConfig(abs);const base=fs.statSync(abs).isDirectory()?abs:path.dirname(abs);
 const excluded=new Set([...skip,...config.audit.exclude]);
 const files=fs.statSync(abs).isDirectory()?walk(abs,[],excluded,config.audit.max_file_bytes):[abs];const findings=[];const diagnostics=[];
 for(const file of files){if(!extOK.has(path.extname(file)))continue;if(fs.statSync(file).size>config.audit.max_file_bytes)continue;
  const src=fs.readFileSync(file,'utf8');const ext=path.extname(file);const jsx=['.jsx','.tsx'].includes(ext)?analyzeJsx(src,file):null;if(jsx&&!jsx.available)diagnostics.push({file:path.relative(base,file),reason:jsx.reason});if(jsx?.parse_diagnostics?.length)diagnostics.push({file:path.relative(base,file),reason:'JSX parser diagnostics',details:jsx.parse_diagnostics});const behavior=['.js','.jsx','.ts','.tsx'].includes(ext)?analyzeBehavior(src,file):null;
  if(behavior&&!behavior.available)diagnostics.push({file:path.relative(base,file),reason:behavior.reason});
  if(behavior?.parse_diagnostics?.length)diagnostics.push({file:path.relative(base,file),reason:'JS/TS parser diagnostics',details:behavior.parse_diagnostics});
  const hits=['.html','.htm'].includes(ext)?analyzeHtml(src):jsx?.available?[...jsx.findings,...(behavior?.available?behavior.findings:scan(src,'.js').filter(h=>h.id.startsWith('JS-')))]:behavior?.available?[...behavior.findings,...scan(src,ext).filter(h=>h.id==='JS-004')]:scan(src,ext);for(const hit of hits){const rule=rules.find(r=>r.id===hit.id);if(!rule)continue;findings.push({rule_id:hit.id,severity:rule.severity,title:rule.title,status:hit.verified?'FAIL':'UNVERIFIED',file:path.relative(base,file)||path.basename(file),line:hit.line??lineOf(src,hit.index),column:hit.column??((hit.index??0)-(src.lastIndexOf('\n',(hit.index??0)-1)+1)+1),evidence:hit.detail,verification_method:hit.id.startsWith('JS-')&&behavior?.available&&hit.id!=='JS-004'?'typescript-call-ast':jsx?.available?'typescript-jsx-ast':hit.verified?'html-source-tokenizer':'heuristic-static',autofix:false});}}
 findings.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.rule_id.localeCompare(b.rule_id));
 return {schema_version:'0.6',engine_version:'1.3.0',root:abs,scanned_files:files.length,limitations:['FAIL denotes source-confirmed pattern, not complete accessibility or WCAG failure; UNVERIFIED denotes heuristic candidates.','Static audit does not perform runtime, accessibility conformance, user testing, or business task validation.'],findings,diagnostics,counts:{error:findings.filter(f=>f.severity==='error').length,warning:findings.filter(f=>f.severity==='warning').length,confirmed:findings.filter(f=>f.status==='FAIL').length,unverified:findings.filter(f=>f.status==='UNVERIFIED').length},configuration:{fail_on:config.audit.fail_on}};
}

export function markdown(report){return `# UI/UX Static Audit\n\nFiles scanned: ${report.scanned_files}  \nConfirmed patterns: ${report.counts.confirmed}  \nUnverified candidates: ${report.counts.unverified}  \nErrors: ${report.counts.error}  \nWarnings: ${report.counts.warning}\n\n| Status | Severity | Rule | Location | Evidence |\n|---|---|---|---|---|\n${report.findings.map(f=>`| ${f.status} | ${f.severity} | ${f.rule_id} | ${f.file.replace(/\|/g,'\\|')}:${f.line} | ${f.evidence.replace(/\|/g,'\\|')} |`).join('\n')}\n\n## Limitations\n${report.limitations.map(x=>`- ${x}`).join('\n')}\n`;}
