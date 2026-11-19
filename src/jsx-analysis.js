import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

export function loadTypeScript(){
  try{return require('typescript');}catch{}
  // Local developer environments may have a globally installed compiler.
  const globalPath=path.resolve(path.dirname(process.execPath),'../lib/node_modules/typescript');
  try{return require(globalPath);}catch{}
  return null;
}
const isElement=(ts,n)=>ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n);
const tag=(ts,n)=>ts.isJsxElement(n)?n.openingElement:n;
const tagName=(ts,n)=>tag(ts,n).tagName.getText();
function attr(ts,n,name){return tag(ts,n).attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText().toLowerCase()===name.toLowerCase());}
function hasSpread(ts,n){return tag(ts,n).attributes.properties.some(p=>ts.isJsxSpreadAttribute(p));}
function val(ts,a){if(!a)return {kind:'missing'};if(!a.initializer)return {kind:'static',value:true};if(ts.isStringLiteral(a.initializer))return {kind:'static',value:a.initializer.text};if(ts.isJsxExpression(a.initializer)){
  const e=a.initializer.expression;
  if(e&&(ts.isStringLiteral(e)||ts.isNoSubstitutionTemplateLiteral(e)||ts.isNumericLiteral(e)))return {kind:'static',value:e.text};
  if(e&&(e.kind===ts.SyntaxKind.TrueKeyword||e.kind===ts.SyntaxKind.FalseKeyword))return {kind:'static',value:e.kind===ts.SyntaxKind.TrueKeyword};
}return {kind:'dynamic'};}
function nameAttrs(ts,n){return ['aria-label','aria-labelledby','title'].some(x=>{const v=val(ts,attr(ts,n,x));return v.kind==='dynamic'||(v.kind==='static'&&String(v.value).trim()!=='');});}
function staticText(ts,n){if(ts.isJsxText(n))return n.text.trim().length>0;if(ts.isJsxExpression(n))return false;if(ts.isJsxElement(n))return n.children.some(c=>staticText(ts,c));return false;}
function uncertainChild(ts,n){if(ts.isJsxExpression(n)||ts.isJsxSpreadChild(n))return true;if(ts.isJsxElement(n))return n.children.some(c=>uncertainChild(ts,c));return false;}
function nested(ts,n){const stack=[...n.children];while(stack.length){const c=stack.pop();if(isElement(ts,c)&&['button','a','input','select','textarea'].includes(tagName(ts,c).toLowerCase()))return true;if(ts.isJsxElement(c)||ts.isJsxFragment(c))stack.push(...c.children);}return false;}
function labelWrapped(ts,n){let p=n.parent;while(p){if(isElement(ts,p)&&tagName(ts,p).toLowerCase()==='label')return true;p=p.parent;}return false;}
/** Findings from TypeScript's syntax tree. Source-confirmed patterns are not claims about the rendered DOM. */
export function analyzeJsx(src,filename='component.tsx'){
 const ts=loadTypeScript();if(!ts)return {available:false,findings:[],reason:'TypeScript compiler unavailable; install dependency: npm install typescript'};
 const sf=ts.createSourceFile(filename,src,ts.ScriptTarget.Latest,true,filename.endsWith('.tsx')||filename.endsWith('.jsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const nodes=[];function visit(n){if(isElement(ts,n))nodes.push(n);ts.forEachChild(n,visit);}visit(sf);
 const ids=new Map();const labels=new Set();for(const n of nodes){if(tagName(ts,n).toLowerCase()==='label'){const a=val(ts,attr(ts,n,'htmlFor'));if(a.kind==='static')labels.add(String(a.value));}}
 const findings=[];const add=(id,n,detail,verified=true)=>{const t=tag(ts,n);const start=t.getStart(sf);const lc=sf.getLineAndCharacterOfPosition(start);findings.push({id,index:start,line:lc.line+1,column:lc.character+1,detail,verified});};
 for(const n of nodes){const name=tagName(ts,n).toLowerCase();const spread=hasSpread(ts,n);const a=x=>val(ts,attr(ts,n,x));
  if(name==='img'&&a('alt').kind==='missing')add('HTML-001',n,spread?'Image may receive alt through spread; inspect props':'img missing alt',!spread);
  if(name==='iframe'&&a('title').kind==='missing')add('HTML-013',n,spread?'iframe title may be spread':'iframe missing title',!spread);
  if(name==='input'&&a('type').value!=='hidden'){
    const id=a('id');const labeled=nameAttrs(ts,n)||labelWrapped(ts,n)||(id.kind==='static'&&labels.has(String(id.value)));
    if(!labeled)add('HTML-004',n,'Input has no statically established accessible label; dynamic props/labeling may exist',false);
    if(a('name').kind==='missing')add('HTML-015',n,'input name not statically present; controlled components may not need it',false);
  }
  if(name==='button'&&ts.isJsxElement(n)&&!staticText(ts,n)&&!nameAttrs(ts,n))add('HTML-003',n,'Button lacks static text or accessible name; expressions may render a label',false);
  if(name==='a'&&ts.isJsxElement(n)&&!staticText(ts,n)&&!nameAttrs(ts,n))add('HTML-007',n,'Link lacks static text or accessible name; expressions may render a label',false);
  if(['a','button'].includes(name)&&ts.isJsxElement(n)&&nested(ts,n))add('HTML-011',n,'Nested interactive JSX element; component rendering may differ',false);
  if(name==='div'&&attr(ts,n,'onClick'))add('HTML-014',n,'Clickable div; inspect keyboard support and semantics',false);
  const tab=a('tabIndex');if(tab.kind==='static'&&Number(tab.value)>0)add('HTML-009',n,'positive tabIndex',true);
  if(attr(ts,n,'autoFocus'))add('HTML-010',n,'autoFocus specified',true);
  const id=a('id');if(id.kind==='static'&&String(id.value).trim()){
    if(ids.has(id.value))add('HTML-008',n,`duplicate static JSX id ${id.value} (may render in different branches)`,false);
    else ids.set(id.value,n);
  }
  if(name==='a'&&a('target').value==='_blank'&&a('rel').kind==='missing')add('HTML-012',n,'target=_blank without explicit rel; modern browsers imply noopener',false);
 }
 return {available:true,findings,parse_diagnostics:sf.parseDiagnostics.map(d=>({message:ts.flattenDiagnosticMessageText(d.messageText,' '),start:d.start}))};
}
