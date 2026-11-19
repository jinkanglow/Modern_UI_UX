import {loadTypeScript} from './jsx-analysis.js';

/** Syntax-only JS/TS call-site analysis. Never infers the user's workflow from an API name. */
export function analyzeBehavior(source, filename='file.ts') {
  const ts=loadTypeScript();
  if(!ts)return {available:false,findings:[],reason:'TypeScript compiler unavailable'};
  const kind=/\.[jt]sx$/.test(filename)?ts.ScriptKind.TSX:/\.jsx?$/.test(filename)?ts.ScriptKind.JS:ts.ScriptKind.TS;
  const sf=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,kind);
  const findings=[];
  const add=(id,node,detail,verified=false)=>{
    const start=node.getStart(sf),pos=sf.getLineAndCharacterOfPosition(start);
    findings.push({id,index:start,line:pos.line+1,column:pos.character+1,detail,verified});
  };
  const localBindings=new Set();
  function collect(n){
    if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))localBindings.add(n.name.text);
    if(ts.isParameter(n)&&ts.isIdentifier(n.name))localBindings.add(n.name.text);
    if(ts.isFunctionDeclaration(n)&&n.name)localBindings.add(n.name.text);
    if(ts.isImportClause(n)&&n.name)localBindings.add(n.name.text);
    if(ts.isImportSpecifier(n))localBindings.add(n.name.text);
    ts.forEachChild(n,collect);
  }
  collect(sf);
  function visit(n){
    if(ts.isCallExpression(n)){
      const expr=n.expression;
      let method=null,root=null;
      if(ts.isIdentifier(expr))method=expr.text;
      else if(ts.isPropertyAccessExpression(expr)){
        method=expr.name.text;
        if(ts.isIdentifier(expr.expression))root=expr.expression.text;
        else if(ts.isPropertyAccessExpression(expr.expression)&&ts.isIdentifier(expr.expression.expression)&&expr.expression.expression.text==='globalThis'){
          root=expr.expression.name.text;
        }
      }
      const dialogs={alert:'JS-001',confirm:'JS-002',prompt:'JS-003'};
      if(method in dialogs && (root===null||root==='window'||root==='globalThis') && !(root===null&&localBindings.has(method))){
        const shadowed=localBindings.has(root??method);
        add(dialogs[method],n,`${method}() call expression${shadowed?' (identifier may be shadowed)':''}; review interaction context`,false);
      }
      if(method==='write'&&root==='document')add('JS-005',n,`document.write() call expression${localBindings.has('document')?' (document may be shadowed)':''}`,false);
    }
    ts.forEachChild(n,visit);
  }
  visit(sf);
  return {available:true,findings,parse_diagnostics:sf.parseDiagnostics.map(d=>({message:ts.flattenDiagnosticMessageText(d.messageText,' '),start:d.start}))};
}
