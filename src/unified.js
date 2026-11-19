/** Combines evidence without conflating source findings with browser observations. */
export function unifiedReport(staticReport,interactionReport){
 const staticConfirmed=staticReport.findings.filter(f=>f.status==='FAIL');
 const staticErrors=staticConfirmed.filter(f=>f.severity==='error');
 const interactionFailures=interactionReport.findings.filter(f=>f.status==='FAIL');
 return {schema_version:'1.0',engine_version:'1.0.0',mode:'unified',static:staticReport,interaction:interactionReport,
  gates:{blocked:staticErrors.length>0||interactionFailures.length>0,static_errors:staticErrors.length,interaction_failures:interactionFailures.length,unverified:staticReport.findings.filter(f=>f.status==='UNVERIFIED').length},
  limitations:['Static findings and browser findings are separate evidence types.','Only declared interaction scenarios are executed.','No overall WCAG or UX quality certification is implied.']};
}
export function unifiedMarkdown(report){return `# UI/UX Unified Verification\n\nStatic confirmed errors: ${report.gates.static_errors}\n\nInteraction failures: ${report.gates.interaction_failures}\n\nUnverified static candidates: ${report.gates.unverified}\n\nCI blocked: ${report.gates.blocked}\n\n## Browser scenarios\n${report.interaction.scenarios.map(s=>`- ${s.id}: ${s.status}`).join('\n')}\n\n## Limitations\n${report.limitations.map(x=>`- ${x}`).join('\n')}\n`;}
