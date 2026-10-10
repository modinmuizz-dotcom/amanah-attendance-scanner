/* AMANAH printable A4 repair and equipment maintenance records. Read-only. */
(function(){
'use strict';
const esc = value => String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const val = value => value==null || value==='' ? '—' : String(value);
const cell = (label,value) => '<div class="info"><div class="label">'+esc(label)+'</div><div class="value">'+esc(val(value))+'</div></div>';
const fields = list => '<div class="info-grid">'+list.map(x=>cell(x[0],x[1])).join('')+'</div>';
const section = (title,content) => '<section class="section"><h2>'+esc(title)+'</h2>'+content+'</section>';
const table = (heads,rows) => '<table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
 (rows.length ? rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(val(x))+'</td>').join('')+'</tr>').join('') :
 '<tr><td colspan="'+heads.length+'">No entries recorded.</td></tr>')+'</tbody></table>';
const cash = v => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
// The print document lives in an invisible SAME-PAGE iframe.
// No window.open(), browser tab, or secondary preview page is created.
const printFrames=new WeakMap();
function open(title){
 const frame=document.createElement('iframe');
 frame.setAttribute('title','AMANAH A4 printing');
 frame.setAttribute('aria-hidden','true');
 frame.style.cssText='position:fixed!important;left:-10000px!important;top:0!important;width:800px!important;height:1120px!important;opacity:0!important;pointer-events:none!important;border:0!important;z-index:-1!important';
 document.body.appendChild(frame);
 const win=frame.contentWindow;
 printFrames.set(win,frame);
 win.document.open();
 win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing print record</title></head><body>Preparing '+esc(title)+'...</body></html>');
 win.document.close();
 return win;
}
function release(win){
 const frame=printFrames.get(win);
 if(!frame)return;
 printFrames.delete(win);
 if(frame.isConnected)frame.remove();
}
function error(win,err){
 if(!win)return;
 console.error('AMANAH print preparation failed',err);
 release(win);
}
function printPage(win,config){
 if(!win||win.closed)return;
 const pictures=(config.photos||[]).filter(p=>p.src).map(p=>
  '<figure class="photo"><img src="'+esc(p.src)+'" alt="Photo evidence"><figcaption>'+esc(p.label||'PHOTO EVIDENCE')+'</figcaption></figure>'
 ).join('');
 const photoSection=section('PHOTO EVIDENCE',pictures?'<div class="photos">'+pictures+'</div>':'<p class="empty">No printable photo evidence attached.</p>');
 const css=[
 '@page{size:A4 portrait;margin:14mm 13mm}',
 '*{box-sizing:border-box}',
 'html,body{margin:0;padding:0;background:#fff;color:#152038;font:10.5px/1.45 Arial,Helvetica,sans-serif}',
 '.shell{width:100%;max-width:100%;overflow:visible}',
 '.brand{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:12px;border-bottom:3px solid #1d4ed8}',
 '.company{font-size:20px;letter-spacing:.025em;font-weight:900;color:#153d91}',
 '.company-sub{font-size:9px;font-weight:700;color:#64748b}',
 '.record-name{font-size:17px;font-weight:900;text-transform:uppercase;margin:12px 0 2px}',
 '.record-number{font-size:11px;font-weight:800}',
 '.status{border:1px solid #94a3b8;border-radius:16px;padding:5px 11px;font-size:10px;font-weight:900;white-space:nowrap}',
 '.section{margin-top:16px;break-inside:auto}',
 '.section h2{font-size:11px;font-weight:900;letter-spacing:.045em;color:#1e40af;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #cbd5e1}',
 '.info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
 '.info{min-width:0;overflow-wrap:anywhere;border:1px solid #dde4ee;border-radius:7px;padding:8px;break-inside:avoid}',
 '.label{font-size:8px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:.03em}',
 '.value{font-size:10px;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:3px}',
 'table{width:100%;border-collapse:collapse;table-layout:fixed;overflow:visible}',
 'th{background:#eef3fa;font-size:8px;color:#334155;text-transform:uppercase}',
 'th,td{padding:7px 6px;border:1px solid #dbe2ed;text-align:left;vertical-align:top;overflow-wrap:anywhere}',
 'tr{break-inside:avoid;page-break-inside:avoid}',
 '.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
 '.photo{margin:0;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}',
 '.photo img{display:block;width:100%;height:auto;max-height:85mm;object-fit:contain;background:#f8fafc}',
 '.photo figcaption{padding:6px 8px;font-size:9px;font-weight:800;color:#334155}',
 '.empty{color:#64748b}',
 '.footer{margin-top:18px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:9px;color:#64748b}',
 '.print-tools{position:sticky;top:0;z-index:5;display:flex;justify-content:center;gap:12px;align-items:center;background:#eff6ff;padding:10px;margin-bottom:20px;border-bottom:1px solid #bfdbfe}',
 '.print-tools button{border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:10px 18px;font-weight:900;cursor:pointer}',
 '.print-tools span{font-size:12px;color:#334155}',
 '@media screen{body{max-width:920px;margin:auto;padding:0 20px 28px}}',
 '@media print{.print-tools{display:none!important}html,body{height:auto!important;overflow:visible!important}}'
 ].join('\n');
 const parts=[
 '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
 '<title>',esc(config.title),' — ',esc(config.number||'AMANAH'),'</title><style>',css,'</style></head><body>',
 '<main class="shell"><header class="brand"><div><div class="company">AMANAH</div><div class="company-sub">AMANAH CONSTRUCTION SERVICES · OFFICIAL RECORD</div></div>',
 '<div class="status">',esc(config.status||'—'),'</div></header>',
 '<div class="record-name">',esc(config.title),'</div><div class="record-number">',esc(config.number||''),'</div>',
 (config.sections||[]).join(''),photoSection,
 '<footer class="footer">Generated ',esc(new Date().toLocaleString('en-PH')),' · AMANAH Construction Management System</footer>',
 '</main></body></html>'
 ];
 win.document.open();
 win.document.write(parts.join(''));
 win.document.close();

 // Wait briefly for photo evidence so it appears in the native browser print preview.
 // Always release the embedded document AFTER printing (not before the dialog).
 const imgs=Array.from(win.document.querySelectorAll('.photo img'));
 const loaded=Promise.all(imgs.map(img=>{
   if(img.complete)return Promise.resolve();
   return new Promise(done=>{
     img.addEventListener('load',done,{once:true});
     img.addEventListener('error',done,{once:true});
   });
 }));
 let printed=false;
 const cleanup=()=>release(win);
 win.addEventListener('afterprint',cleanup,{once:true});
 // Fallback for browsers that omit the afterprint event; do not interrupt print preview.
 const fallback=setTimeout(()=>{if(printed)cleanup();},180000);
 Promise.race([loaded,new Promise(done=>setTimeout(done,4500))]).then(()=>{
   setTimeout(()=>{
     if(!printFrames.has(win))return;
     try{
       printed=true;
       win.focus();
       win.print();  // Opens Chrome/Edge Print dialog IN THIS TAB.
     }catch(err){
       clearTimeout(fallback);
       console.error('AMANAH browser printing failed',err);
       cleanup();
       window.alert('Unable to open the print dialog. Please try PRINT again.');
     }
   },150);
 }).catch(err=>{clearTimeout(fallback);error(win,err);});
}
window.AmanahRecordPrint={open,error,printPage,fields,section,table,cash,esc};
})();