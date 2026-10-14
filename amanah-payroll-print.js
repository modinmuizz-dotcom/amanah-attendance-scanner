/* AMANAH Payroll Register — deterministic A4-only printer
 * Generates a standalone print document, independent from dashboard CSS,
 * theme mode, viewport, zoom, and background decorations.
 */
(function(){
  'use strict';
  if(window.AmanahPayrollPrint) return;

  const CSS = String.raw`
@page { size:A4 portrait; margin:10mm 11mm; }
* { box-sizing:border-box; }
html,body { width:100%; min-width:0; min-height:0; padding:0; margin:0; background:#fff; color:#162033; }
html { font-size:10px; -webkit-text-size-adjust:100%; text-size-adjust:100%; }
body {
  font:10px/1.35 Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.report { width:100%; max-width:188mm; margin:0 auto; padding:0; }
.report-top { display:flex; justify-content:space-between; align-items:start; gap:8mm; padding:0 0 3mm; border-bottom:2px solid #1f2937; }
.brand { font-size:14pt; font-weight:900; line-height:1.14; letter-spacing:.015em; }
.doc-title { margin-top:3px; font-size:10.5pt; font-weight:900; letter-spacing:.045em; }
.doc-code { margin-top:4px; font-size:7.5pt; font-weight:700; color:#475569; }
.report-generated { min-width:31mm; text-align:right; padding-top:3px; font-size:7pt; color:#475569; }
.report-generated strong { display:block; font-size:8pt; color:#172339; }
.meta { display:grid; grid-template-columns:1.2fr 1.1fr 1fr; gap:4mm; margin:3.5mm 0 4mm; }
.meta-box { background:#f5f7fb; border:1px solid #dde5ef; border-radius:4px; padding:2.4mm 2.5mm; overflow-wrap:anywhere; }
.meta-box .label { display:block; color:#526581; font-size:6.8pt; font-weight:900; letter-spacing:.04em; }
.meta-box .value { display:block; margin-top:3px; color:#142237; font-size:8.2pt; font-weight:850; }
.summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2mm; margin-bottom:4mm; }
.summary-card { padding:2.3mm 2.5mm; border:1px solid #d7e0ec; border-radius:4px; break-inside:avoid; min-width:0; }
.summary-card .label { display:block; font-size:6.8pt; font-weight:900; color:#64748b; letter-spacing:.025em; }
.summary-card .value { display:block; margin-top:2px; font-weight:900; font-size:10pt; overflow-wrap:anywhere; }
.section { width:100%; margin-top:3.5mm; break-before:auto; page-break-before:auto; }
.section-head { display:flex; justify-content:space-between; gap:5mm; align-items:start; padding:2.2mm 2.5mm; background:#eef2f7; border:1px solid #d7e0eb; border-bottom:0; break-inside:avoid; break-after:avoid; }
.section-kicker { font-size:6.8pt; font-weight:900; color:#284f8e; letter-spacing:.06em; }
.section-title { margin-top:2px; font-size:9.5pt; font-weight:900; }
.section-note { margin-top:2px; font-size:7pt; color:#607086; }
.section-value { text-align:right; font-size:7pt; color:#607086; flex:none; }
.section-value strong { display:block; font-size:9pt; color:#172339; white-space:nowrap; }
table { width:100%; table-layout:fixed; border-collapse:collapse; border-spacing:0; border:1px solid #d7e0eb; }
thead { display:table-header-group; }
th,td {
  padding:2.15mm 1.3mm;
  vertical-align:top;
  text-align:left;
  border-bottom:1px solid #e2e8f0;
  overflow-wrap:anywhere;
  word-break:normal;
}
th { background:#f8fafc; font-size:6.1pt; color:#435572; line-height:1.25; font-weight:900; text-transform:uppercase; }
td { font-size:7pt; color:#1d293b; }
td strong { font-weight:900; }
td .sub { display:block; margin-top:2px; font-size:6.2pt; color:#64748b; }
td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
td.gross { text-align:right; font-weight:900; white-space:nowrap; }
tbody tr { page-break-inside:avoid; break-inside:avoid; }
tr:last-child td { border-bottom:0; }
.empty { text-align:center; padding:4mm 2mm; font-style:italic; color:#718096; }
.report-end { margin-top:3mm; border-top:1px solid #cbd5e1; padding:2mm 0 0; font-size:6.9pt; color:#64748b; }
@media screen {
  body { padding:10mm 11mm; background:#eff2f7; }
  .report { padding:10mm; box-shadow:0 5px 24px #0002; background:white; min-height:180mm; }
}
@media print {
  html,body { width:auto !important; min-height:0 !important; height:auto !important; overflow:visible !important; background:white !important; }
  .report { margin:0 !important; width:100% !important; max-width:none !important; padding:0 !important; min-height:0 !important; box-shadow:none !important; }
  .section,.summary,.meta,.report-top { overflow:visible !important; }
  .report-end { break-inside:avoid; }
}
`;

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function pesos(v){
    const n=Number(v);
    return '₱'+(Number.isFinite(n)?n:0).toLocaleString('en-PH',{
      minimumFractionDigits:2, maximumFractionDigits:2
    });
  }
  function decimal(v){const n=Number(v); return (Number.isFinite(n)?n:0).toFixed(2);}
  function makeRow(values,classes=[]){
    return '<tr>'+values.map((v,i)=>'<td'+(classes[i]?' class="'+classes[i]+'"':'')+'>'+v+'</td>').join('')+'</tr>';
  }
  function build(snapshot){
    const employees=Array.isArray(snapshot.employees)?snapshot.employees:[];
    const groups=Array.isArray(snapshot.groups)?snapshot.groups:[];
    const totalEmployee=employees.reduce((sum,r)=>sum+(Number(r.gross)||0),0);
    const totalGroup=groups.reduce((sum,r)=>sum+(Number(r.gross)||0),0);
    const workDays=employees.reduce((sum,r)=>sum+(
      r.rateType==='DAILY'?(Number(r.fullDays)||0)+(Number(r.halfDays)||0):0
    ),0);
    const hours=employees.reduce((sum,r)=>sum+(r.rateType==='HOURLY'?(Number(r.hours)||0):0),0);
    const employeeRows=employees.map(row=>{
      const daily=row.rateType==='DAILY';
      return makeRow([
        '<strong>'+esc(row.employeeName)+'</strong><span class="sub">'+esc(row.employeeId)+'</span>',
        esc(row.department),
        esc(row.rateType),
        pesos(row.rate)+'<span class="sub">'+(daily?'PER DAY':'PER HOUR')+'</span>',
        daily?decimal(row.attendanceDays):'—',
        daily?decimal(row.fullDays):'—',
        daily?decimal(row.halfDays):'—',
        decimal(row.hours),
        pesos(row.gross)
      ],['','','','num','num','num','num','num','gross']);
    }).join('')||'<tr><td class="empty" colspan="9">No employee payroll entries for this period.</td></tr>';
    const groupRows=groups.map(row=>makeRow([
      '<strong>'+esc(row.groupName)+'</strong>',
      '<strong>'+esc(row.projectName)+'</strong><span class="sub">'+esc(row.projectId)+'</span>',
      esc(row.activity),
      pesos(row.ratePerMeter),
      decimal(row.metersAccomplished),
      pesos(row.gross)
    ],['','','','num','num','gross'])).join('')||
      '<tr><td class="empty" colspan="6">No group labor entries added.</td></tr>';

    const documentHTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMANAH Payroll Register</title><style>${CSS}</style></head>
<body><main class="report">
  <div class="report-top">
    <div><div class="brand">AMANAH CONSTRUCTION SERVICES</div>
      <div class="doc-title">PAYROLL REGISTER</div>
      <div class="doc-code">Official Payroll Summary</div></div>
    <div class="report-generated">GENERATED (PHT)<strong>${esc(snapshot.generated)}</strong></div>
  </div>
  <div class="meta">
    <div class="meta-box"><span class="label">PAYROLL PERIOD</span><span class="value">${esc(snapshot.period)}</span></div>
    <div class="meta-box"><span class="label">EMPLOYEE FILTER</span><span class="value">${esc(snapshot.employeeLabel)}</span></div>
    <div class="meta-box"><span class="label">REGISTER</span><span class="value">EMPLOYEE &amp; GROUP LABOR</span></div>
  </div>
  <div class="summary">
    <div class="summary-card"><span class="label">EMPLOYEES</span><span class="value">${employees.length}</span></div>
    <div class="summary-card"><span class="label">WORK DAYS</span><span class="value">${decimal(workDays)}</span></div>
    <div class="summary-card"><span class="label">TRUCKER HOURS</span><span class="value">${decimal(hours)}</span></div>
    <div class="summary-card"><span class="label">GROSS PAYROLL</span><span class="value">${pesos(totalEmployee+totalGroup)}</span></div>
  </div>
  <section class="section">
    <div class="section-head"><div><div class="section-kicker">PAYROLL REGISTER</div>
      <div class="section-title">EMPLOYEE PAYROLL</div>
      <div class="section-note">Daily rates with optional half-day classification.</div></div>
    <div class="section-value">EMPLOYEE GROSS<strong>${pesos(totalEmployee)}</strong></div></div>
    <table><colgroup>
      <col style="width:17%"><col style="width:13%"><col style="width:9%">
      <col style="width:12%"><col style="width:10%"><col style="width:8%">
      <col style="width:8%"><col style="width:9%"><col style="width:14%">
    </colgroup><thead><tr>
      <th>EMPLOYEE</th><th>DEPARTMENT</th><th>PAY BASIS</th><th class="num">RATE</th>
      <th class="num">ATTENDANCE DAYS</th><th class="num">FULL DAYS</th><th class="num">HALF DAYS</th>
      <th class="num">HOURS</th><th class="num">GROSS PAY</th>
    </tr></thead><tbody>${employeeRows}</tbody></table>
  </section>
  <section class="section">
    <div class="section-head"><div><div class="section-kicker">MANUAL PRODUCTION PAYROLL</div>
      <div class="section-title">GROUP LABOR PAYROLL</div>
      <div class="section-note">Rate × accomplished meters, by project and labor group.</div></div>
    <div class="section-value">GROUP LABOR GROSS<strong>${pesos(totalGroup)}</strong></div></div>
    <table><colgroup>
      <col style="width:16%"><col style="width:18%"><col style="width:30%">
      <col style="width:12%"><col style="width:12%"><col style="width:12%">
    </colgroup><thead><tr>
      <th>GROUP</th><th>PROJECT</th><th>ACTIVITY / DESCRIPTION</th>
      <th class="num">RATE / METER</th><th class="num">METERS ACCOMPLISHED</th><th class="num">GROSS PAY</th>
    </tr></thead><tbody>${groupRows}</tbody></table>
  </section>
  <div class="report-end">AMANAH Construction Services · Philippine Standard Time · All values in PHP (₱)</div>
</main></body></html>`;
    return documentHTML;
  }

  function print(snapshot){
    const printer=window.AmanahDirectPrint;
    if(!printer || typeof printer.create!=='function' || typeof printer.finish!=='function'){
      throw new Error('AMANAH print engine is not available. Refresh the page and try again.');
    }
    // The print frame intentionally has no link to the application's CSS or JS.
    const target=printer.create('Payroll Register');
    try {
      const doc=target.document;
      doc.open();
      doc.write(build(snapshot));
      doc.close();
      printer.finish(target);
    }catch(error){
      printer.release(target);
      throw error;
    }
  }
  window.AmanahPayrollPrint={print,build};
})();