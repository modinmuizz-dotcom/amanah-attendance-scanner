const FP_URL='https://bafmycjninxomufhkjvy.supabase.co';
const FP_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const fpDb=window.supabase.createClient(FP_URL,FP_KEY);
const fp={runs:[],items:[],groups:[],claims:[],decisions:[],active:null,busy:false};
const $=id=>document.getElementById(id);
const safe=x=>x==null?'':String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const peso=x=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x)||0);
const pretty=d=>d?new Date(d).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';
function say(message,error=false){const v=$('fpMessage');v.hidden=false;v.className='fp-message'+(error?' error':'');v.textContent=message;}
async function getRows(table,fields,order){
 let q=fpDb.from(table).select(fields);
 if(order)q=q.order(order,{ascending:false});
 const {data,error}=await q;
 if(error)throw error;
 return data||[];
}
async function bootstrap(){
 const {data:{session},error:authError}=await fpDb.auth.getSession();
 if(authError)throw authError;
 if(!session){location.href='admin.html';return;}
 const {data:allowed,error}=await fpDb.rpc('amanah_payroll_can_approve');
 if(error)throw error;
 if(!allowed){
   document.querySelector('.fp-page').innerHTML='<section class="fp-panel" style="padding:30px"><h2>PAYROLL APPROVAL ACCESS REQUIRED</h2><p>Only a user assigned the Financial Manager role (or authorized Super Admin) can approve paychecks.</p><a href="dashboard.html">Return to Dashboard</a></section>';
   return;
 }
 await refreshFinance();
}
async function refreshFinance(){
 const b=$('fpRefresh');if(b)b.disabled=true;
 try{
  const [runs,items,groups,claims,decisions]=await Promise.all([
   getRows('payroll_runs','*','created_at'),
   getRows('payroll_items','payroll_item_id,payroll_run_id,employee_name,department,gross_pay','created_at'),
   getRows('payroll_group_items','payroll_group_item_id,payroll_run_id,group_name,project_id,gross_pay','created_at'),
   getRows('payroll_paycheck_claims','id,payroll_run_id,amount,recipient_name','created_at'),
   getRows('payroll_approval_decisions','id,payroll_run_id,decision,notes,decided_at','decided_at')
  ]);
  Object.assign(fp,{runs,items,groups,claims,decisions});
  renderFinance();
 }catch(error){console.error(error);say('Could not load payroll approval records: '+error.message,true);}
 finally{if(b)b.disabled=false;}
}
function rowsFor(runId){return [...fp.items.filter(r=>r.payroll_run_id===runId).map(r=>({name:r.employee_name,amount:r.gross_pay,type:'EMPLOYEE'})),...fp.groups.filter(r=>r.payroll_run_id===runId).map(r=>({name:r.group_name+' • '+r.project_id,amount:r.gross_pay,type:'GROUP'}))];}
function renderFinance(){
 const pending=fp.runs.filter(r=>r.status==='PENDING_APPROVAL');
 $('fpPendingCount').textContent=String(pending.length);
 $('fpPendingAmount').textContent=peso(pending.reduce((s,r)=>s+Number(r.total_gross||0),0));
 $('fpApprovedCount').textContent=String(fp.runs.filter(r=>r.status==='APPROVED').length);
 $('fpRejectedCount').textContent=String(fp.runs.filter(r=>r.status==='REJECTED').length);
 $('fpPendingBody').innerHTML=pending.length?pending.map(r=>`
   <tr>
     <td><strong>${safe(r.period_start)} – ${safe(r.period_end)}</strong></td>
     <td>${safe(r.employee_count)} employees <small>${fp.groups.filter(g=>g.payroll_run_id===r.payroll_run_id).length} Group Labor entries</small></td>
     <td><strong>${peso(r.total_gross)}</strong></td>
     <td>${safe(pretty(r.submitted_at))}</td>
     <td><span class="fp-status">PENDING APPROVAL</span></td>
     <td><button type="button" data-fp-review="${safe(r.payroll_run_id)}" class="fp-btn primary">REVIEW PAYROLL</button></td>
   </tr>`).join(''):'<tr><td colspan="6" class="fp-empty">No payroll awaiting Financial Manager approval.</td></tr>';
 const decisions=fp.runs.filter(r=>['APPROVED','REJECTED'].includes(r.status));
 $('fpDecisionsBody').innerHTML=decisions.length?decisions.map(r=>{
  const claimed=fp.claims.filter(c=>c.payroll_run_id===r.payroll_run_id).length;
  const total=rowsFor(r.payroll_run_id).length;
  return '<tr><td><strong>'+safe(r.period_start)+' – '+safe(r.period_end)+'</strong></td>'+
   '<td><span class="fp-status '+r.status.toLowerCase()+'">'+safe(r.status)+'</span></td>'+
   '<td><strong>'+peso(r.total_gross)+'</strong></td>'+
   '<td>'+safe(pretty(r.reviewed_at))+'</td>'+
   '<td>'+safe(r.review_notes||'—')+'</td>'+
   '<td>'+(r.status==='APPROVED'?claimed+' / '+total+' claimed':'NOT RELEASED')+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="fp-empty">No approval decisions recorded yet.</td></tr>';
}
function showReview(runId){
 const run=fp.runs.find(r=>r.payroll_run_id===runId&&r.status==='PENDING_APPROVAL');
 if(!run)return say('This payroll is no longer pending. Please refresh.',true);
 fp.active=run;const lines=rowsFor(runId);
 $('fpReviewSummary').innerHTML=
  '<div>PAYROLL PERIOD</div><strong>'+safe(run.period_start)+' – '+safe(run.period_end)+'</strong>'+
  '<div style="margin-top:10px">GROSS PAYROLL: <strong>'+peso(run.total_gross)+'</strong></div>'+
  '<div style="margin-top:6px">PAYABLE ENTRIES: '+lines.length+' • SUBMITTED: '+safe(pretty(run.submitted_at))+'</div>';
 const build=type=>{
  const list=lines.filter(r=>r.type===type);
  return list.length?list.map(r=>'<div class="fp-review-row"><span>'+safe(r.name)+'</span><strong>'+peso(r.amount)+'</strong></div>').join(''):'<div class="fp-review-row"><span>No entries</span></div>';
 };
 $('fpEmployeeRows').innerHTML=build('EMPLOYEE');
 $('fpGroupRows').innerHTML=build('GROUP');
 $('fpRemarks').value='';$('fpReviewError').hidden=true;$('fpReviewError').textContent='';
 $('fpReviewModal').classList.add('is-open');$('fpReviewModal').setAttribute('aria-hidden','false');
 $('fpRemarks').focus();
}
function closeReview(){if(fp.busy)return;fp.active=null;$('fpReviewModal').classList.remove('is-open');$('fpReviewModal').setAttribute('aria-hidden','true');}
async function decidePayroll(approve){
 if(fp.busy||!fp.active)return;
 const notes=$('fpRemarks').value.trim();
 if(!approve&&!notes){$('fpReviewError').hidden=false;$('fpReviewError').textContent='Please give a reason for rejection.';$('fpRemarks').focus();return;}
 const run=fp.active;
 // Review is complete before the server-side approval request; never trust UI as authority.
 fp.busy=true;
 const ids=['fpApprove','fpReject','fpCancel','fpCloseReview'];
 ids.forEach(id=>$(id).disabled=true);
 $('fpReviewError').hidden=true;
 try{
  const {error}=await fpDb.rpc('amanah_payroll_decide',{p_run_id:run.payroll_run_id,p_approve:approve,p_notes:notes||null});
  if(error)throw error;
  fp.busy=false;closeReview();
  say(approve?'Payroll approved. Employee and Group Labor paychecks are now eligible for release.':'Payroll rejected. Payroll staff must prepare a corrected run.');
  await refreshFinance();
 }catch(e){$('fpReviewError').hidden=false;$('fpReviewError').textContent=e.message||'Unable to record decision.';}
 finally{fp.busy=false;ids.forEach(id=>$(id).disabled=false);}
}
document.addEventListener('DOMContentLoaded',()=>{
 $('fpRefresh').addEventListener('click',refreshFinance);
 $('fpPendingBody').addEventListener('click',e=>{const action=e.target.closest('[data-fp-review]');if(action)showReview(action.dataset.fpReview);});
 $('fpCancel').addEventListener('click',closeReview);
 $('fpCloseReview').addEventListener('click',closeReview);
 $('fpApprove').addEventListener('click',()=>decidePayroll(true));
 $('fpReject').addEventListener('click',()=>decidePayroll(false));
 $('fpReviewModal').addEventListener('click',e=>{if(e.target.id==='fpReviewModal')closeReview();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('fpReviewModal').classList.contains('is-open'))closeReview();});
 bootstrap().catch(e=>say(e.message||'Cannot open Payroll Approval Center.',true));
});
