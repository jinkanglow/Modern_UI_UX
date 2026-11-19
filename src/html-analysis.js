// Conservative source-location-aware HTML tokenizer. Not a full HTML5 tree builder.
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function parseAttrs(raw){
 const attrs={}; const re=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let m;
 while((m=re.exec(raw))) attrs[m[1].toLowerCase()]=m[2]??m[3]??m[4]??'';
 return attrs;
}
export function tokenizeHtml(src){
 const nodes=[];const re=/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][\s\S]*?>/g;let m;
 while((m=re.exec(src))){const raw=m[0];if(raw.startsWith('<!'))continue;
 const close=raw.startsWith('</');const nm=/^<\/?([A-Za-z][\w:-]*)/.exec(raw);if(!nm)continue;
 const name=nm[1].toLowerCase();const attrRaw=close?'':raw.slice(nm[0].length,-1).replace(/\/$/,'');
 const node={name,close,attrs:parseAttrs(attrRaw),start:m.index,end:re.lastIndex,raw};nodes.push(node);
 if(!close&&(name==='script'||name==='style')){const endRe=new RegExp(`<\\/${name}\\s*>`,'ig');endRe.lastIndex=re.lastIndex;const end=endRe.exec(src);if(end){nodes.push({name,close:true,attrs:{},start:end.index,end:endRe.lastIndex,raw:end[0]});re.lastIndex=endRe.lastIndex;}}
 }
 return nodes;
}
function lineAt(src,pos){return src.slice(0,pos).split('\n').length;}
export function analyzeHtml(src){
 const nodes=tokenizeHtml(src),open=nodes.filter(n=>!n.close),hits=[];
 const add=(id,n,evidence,verified=true)=>hits.push({id,index:n.start,line:lineAt(src,n.start),detail:evidence,verified});
 const ids=new Map(),labels=new Set(),stack=[];
 for(const n of open)if(n.name==='label'&&n.attrs.for)labels.add(n.attrs.for);
 for(const n of nodes){if(n.close){const i=stack.map(x=>x.name).lastIndexOf(n.name);if(i>=0)stack.splice(i);continue;}
 const a=n.attrs;
 if(a.id){if(ids.has(a.id))add('HTML-008',n,`Duplicate id "${a.id}"`);else ids.set(a.id,n);}
 if(n.name==='img'&&!('alt' in a))add('HTML-001',n,'Image has no alt attribute');
 if(n.name==='iframe'&&!('title' in a))add('HTML-013',n,'Iframe has no title attribute');
 if(n.name==='input'&&a.type!=='hidden'){
   const insideLabel=stack.some(x=>x.name==='label');
   if(!('aria-label' in a)&&!('aria-labelledby' in a)&&!(a.id&&labels.has(a.id))&&!insideLabel)add('HTML-004',n,'Input lacks explicit, wrapping, or ARIA label');
   if(!('name' in a))add('HTML-015',n,'Input has no name; may be intentional',false);
 }
 if(n.name==='button'||n.name==='a'){
  const closeTag=new RegExp(`<\\/${n.name}\\s*>`,'ig');closeTag.lastIndex=n.end;const end=closeTag.exec(src);
  if(end){const inner=src.slice(n.end,end.index).replace(/<[^>]*>/g,'').trim();
   if(!inner&&!('aria-label' in a)&&!('aria-labelledby' in a)&&!/<img\b[^>]*\balt\s*=/.test(src.slice(n.end,end.index)))add(n.name==='button'?'HTML-003':'HTML-007',n,`Empty ${n.name} without accessible name`,false);
  }
 }
 if('tabindex' in a&&Number(a.tabindex)>0)add('HTML-009',n,'Positive tabindex');
 if('autofocus' in a)add('HTML-010',n,'Autofocus requires context review',false);
 if(n.name==='div'&&'onclick' in a)add('HTML-014',n,'Clickable div; keyboard behavior not established',false);
 if((n.name==='a'||n.name==='button')&&stack.some(x=>x.name==='a'||x.name==='button'))add('HTML-011',n,'Nested interactive element');
 if(n.name==='a'&&a.target==='_blank'&&!String(a.rel??'').split(/\s+/).includes('noopener'))add('HTML-012',n,'Blank-target link without explicit noopener; modern browsers imply it',false);
 if(!voids.has(n.name)&&!n.raw.endsWith('/>'))stack.push(n);
 }
 const html=open.find(n=>n.name==='html');if(html&&!('lang' in html.attrs))add('HTML-002',html,'Document html has no lang');
 const title=open.find(n=>n.name==='title');if(!title||!/<title\b[^>]*>\s*[^\s<][\s\S]*?<\/title\s*>/i.test(src))hits.push({id:'HTML-005',index:0,line:1,detail:'Document has no nonempty title',verified:!!html});
 if(!open.some(n=>n.name==='meta'&&n.attrs.name?.toLowerCase()==='viewport'))hits.push({id:'HTML-006',index:0,line:1,detail:'Document has no viewport meta',verified:!!html});
 return hits;
}
