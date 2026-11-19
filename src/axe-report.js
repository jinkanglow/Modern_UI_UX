/** Converts axe findings without misrepresenting manual-review/incomplete nodes as confirmed violations. */
export function normalizeAxe(result,{url,browser}){
 const findings=[];
 for(const [group,verified] of [[result.violations,true],[result.incomplete,false]])for(const violation of group||[])for(const node of violation.nodes||[]){
   const severity=['critical','serious'].includes(violation.impact)?'error':'warning';
   findings.push({rule_id:`AXE-${violation.id}`,severity,title:violation.help,status:verified?'FAIL':'UNVERIFIED',file:url,line:null,column:null,evidence:`${(node.target||[]).join(', ')}: ${node.failureSummary||violation.description||'Manual review required'}`,verification_method:verified?'axe-core/browser-dom':'axe-core/incomplete-manual-review',autofix:false,help_url:violation.helpUrl});
 }
 return {schema_version:'0.5',engine_version:'0.5.0',mode:'runtime',target:url,browser,scanned_files:1,limitations:['Automated axe checks cover only a subset of accessibility requirements.','Results reflect one loaded page and one viewport, not every state, route, or device.','Incomplete axe checks require manual verification. No claim of WCAG conformance.'],findings,counts:{error:findings.filter(f=>f.severity==='error').length,warning:findings.filter(f=>f.severity==='warning').length,confirmed:findings.filter(f=>f.status==='FAIL').length,unverified:findings.filter(f=>f.status==='UNVERIFIED').length},configuration:{fail_on:'error'},axe:{passes:(result.passes||[]).length,incomplete:(result.incomplete||[]).length,inapplicable:(result.inapplicable||[]).length}};
}
