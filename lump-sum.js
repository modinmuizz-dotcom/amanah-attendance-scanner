const LS_URL='https://bafmycjninxomufhkjvy.supabase.co';
const LS_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const lsDb=window.supabase.createClient(LS_URL,LS_KEY);
const ls={projects:[],contracts:[],billings:[],payments:[],variations:[],
 permissions:{},selected:null,mode:null,saving:false};

const $=id=>document.getElementById(id);
const esc=v=>v==null?'':String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
const num=v=>Number(v)||0;
const dateNow=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const prettyDate=s=>s?new Date(String(s).slice(0,10)+'T00:00:00').toLocaleDateString('en-PH'):'—';
const badge=s=>'<span class="ls-badge '+esc(s)+'">'+esc(s)+'</span>';
const btn=(label,action,id,tone='secondary')=>'<button class="ls-btn '+tone+'" type="button" data-ls-action="'+esc(action)+'" data-ls-id="'+esc(id)+'">'+esc(label)+'</button>';
const proof=url=>/^https:\/\//i.test(url||'')?'<a class="ls-proof" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View evidence ↗</a>':'No evidence link';
const field=(label,name,type='text',opts={})=>{
 const full=opts.full?' full':'';
 const id='lsF_'+name;
 const common=' id="'+id+'" name="'+name+'" '+(opts.required?'required':'')+' '+(opts.step?'step="'+opts.step+'"':'')+' '+(opts.min!==undefined?'min="'+opts.min+'"':'')+' '+(opts.max!==undefined?'max="'+opts.max+'"':'')+' ';
 const initial=opts.value===undefined?'':String(opts.value);
 let content;
 if(type==='select'){content='<select'+common+'>'+opts.options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('')+'</select>';}
 else if(type==='textarea'){content='<textarea'+common+' rows="3" placeholder="'+esc(opts.placeholder||'')+'">'+esc(initial)+'</textarea>';}
 else content='<input type="'+type+'"'+common+' value="'+esc(initial)+'" placeholder="'+esc(opts.placeholder||'')+'">';
 return '<div class="ls-field'+full+'"><label for="'+id+'">'+esc(label)+(opts.required?' *':'')+'</label>'+content+(opts.help?'<small>'+esc(opts.help)+'</small>':'')+'</div>';
};
function notify(t,bad=false){$('lsMessage').hidden=false;$('lsMessage').textContent=t;$('lsMessage').className='ls-message'+(bad?' error':'');}
function clearNotify(){$('lsMessage').hidden=true;}
function showModal(title,mode,html,submitLabel='SAVE'){
 ls.mode=mode;$('lsModalTitle').textContent=title;$('lsFormFields').innerHTML=html;
 $('lsSubmit').textContent=submitLabel;$('lsFormError').textContent='';
 $('lsFormPreview').hidden=true;
 $('lsModal').classList.add('open');$('lsModal').setAttribute('aria-hidden','false');
 $('lsFormFields').querySelector('input,select,textarea')?.focus();
}
function closeModal(){if(ls.saving)return;$('lsModal').classList.remove('open');$('lsModal').setAttribute('aria-hidden','true');ls.mode=null;}
function values(){return Object.fromEntries(new FormData($('lsForm')).entries());}
async function rpc(fn,args){const {data,error}=await lsDb.rpc(fn,args||{});if(error)throw error;return data;}
async function loadAll(){
 const [projects,contracts,billings,payments,variations]=await Promise.all([
  lsDb.from('projects').select('project_id,project_name,status').order('project_name'),
  lsDb.from('amanah_lump_contracts').select('*').order('created_at',{ascending:false}),
  lsDb.from('amanah_lump_billings').select('*').order('submitted_at',{ascending:false}),
  lsDb.from('amanah_lump_payments').select('*').order('created_at',{ascending:false}),
  lsDb.from('amanah_lump_variations').select('*').order('submitted_at',{ascending:false})
 ]);
 for(const x of [projects,contracts,billings,payments,variations])if(x.error)throw x.error;
 ls.projects=projects.data||[];ls.contracts=contracts.data||[];ls.billings=billings.data||[];
 ls.payments=payments.data||[];ls.variations=variations.data||[];
 renderContracts();
 const params=new URLSearchParams(location.search);
 const preferred=params.get('contract')||ls.selected;
 const billing=params.get('billing');
 if(billing){const claim=ls.billings.find(b=>b.id===billing);if(claim)ls.selected=claim.contract_id;}
 else if(preferred && ls.contracts.some(c=>c.id===preferred))ls.selected=preferred;
 if(ls.selected && ls.contracts.some(c=>c.id===ls.selected))renderDetail();
 else {$('lsDetailPanel').hidden=true;}
}
function projectName(id){const p=ls.projects.find(p=>p.project_id===id);return p?.project_name||id||'—';}
function contractById(id){return ls.contracts.find(x=>x.id===id);}
function approved(contractId){return ls.billings.filter(b=>b.contract_id===contractId && b.status==='APPROVED');}
function revised(c){return num(c.original_amount)+ls.variations.filter(v=>v.contract_id===c.id && v.status==='APPROVED').reduce((s,v)=>s+num(v.amount_delta),0);}
function getStats(c){
 const bs=approved(c.id),pay=ls.payments.filter(p=>p.contract_id===c.id);
 const earned=bs.reduce((s,b)=>s+num(b.gross_amount),0);
 const retention=bs.reduce((s,b)=>s+num(b.retention_amount),0);
 const recovered=bs.reduce((s,b)=>s+num(b.advance_recovery),0);
 const advance=pay.filter(p=>p.payment_kind==='ADVANCE').reduce((s,p)=>s+num(p.amount),0);
 const paidBilling=pay.filter(p=>p.payment_kind==='BILLING').reduce((s,p)=>s+num(p.amount),0);
 const paidRetention=pay.filter(p=>p.payment_kind==='RETENTION').reduce((s,p)=>s+num(p.amount),0);
 const netPayable=bs.reduce((s,b)=>s+num(b.payable_amount),0);
 return {earned,retention:retention-paidRetention,advance:advance-recovered,
  paid:advance+paidBilling+paidRetention,unpaid:Math.max(0,netPayable-paidBilling),
  certifiedPct:Math.max(0,...bs.map(b=>num(b.cumulative_pct))),revised:revised(c)};
}
function renderContracts(){
 const body=$('lsContracts');
 if(!ls.contracts.length){body.innerHTML='<tr><td colspan="6">No lump-sum contracts have been registered.</td></tr>';return;}
 body.innerHTML=ls.contracts.map(c=>'<tr>'+
  '<td><strong>'+esc(projectName(c.project_id))+'</strong><small>'+esc(c.project_id)+'</small></td>'+
  '<td><strong>'+esc(c.scope_title)+'</strong><small>'+esc(c.contractor_name)+'</small></td>'+
  '<td>'+esc(c.contract_type==='DIRECT_LABOR'?'DIRECT LABOR / PAKYAW':'INDEPENDENT SUBCONTRACTOR')+'</td>'+
  '<td><strong>'+money(revised(c))+'</strong></td>'+
  '<td>'+badge(c.status)+'</td>'+
  '<td>'+btn('OPEN CONTRACT','open',c.id,'primary')+'</td></tr>').join('');
}
function renderDetail(){
 const c=contractById(ls.selected);if(!c)return;
 $('lsDetailPanel').hidden=false;
 const s=getStats(c);
 $('lsSelectedProject').textContent=projectName(c.project_id)+' • '+c.project_id;
 $('lsSelectedTitle').textContent=c.scope_title;
 $('lsSelectedSubtitle').textContent=c.contractor_name+' • '+(c.contract_type==='DIRECT_LABOR'?'Direct labor / pakyaw':'Independent subcontractor');
 $('lsSelectedStatus').className='ls-badge '+c.status;$('lsSelectedStatus').textContent=c.status;
 $('lsContractTotal').textContent=money(s.revised);$('lsEarned').textContent=money(s.earned);
 $('lsPaid').textContent=money(s.paid);$('lsUnpaid').textContent=money(s.unpaid);
 $('lsRetention').textContent=money(s.retention);$('lsAdvance').textContent=money(s.advance);
 $('lsCompliance').textContent=c.contract_type==='DIRECT_LABOR'
  ? 'DIRECT LABOR: Pakyaw payments do not replace employee-level minimum wage, benefits and worker records. Compliance note: '+(c.compliance_notes||'No note recorded')
  : 'SUBCONTRACTOR: Maintain written scope, contractor registration/license where applicable, tax documentation, and payment acknowledgment. '+(c.compliance_notes||'');
 $('lsActivate').hidden=!(c.status==='DRAFT'&&ls.permissions.ACTIVATE);
 $('lsClose').hidden=!(c.status==='ACTIVE'&&ls.permissions.CLOSE&&s.certifiedPct>=100);
 $('lsNewBilling').hidden=!(c.status==='ACTIVE'&&ls.permissions.CREATE);
 $('lsNewVariation').hidden=!(c.status==='ACTIVE'&&ls.permissions.CREATE);
 $('lsNewPayment').hidden=!(c.status!=='DRAFT'&&ls.permissions.PAY);
 renderBillings(c);renderVariations(c);renderPayments(c);
}
function renderBillings(c){
 const bs=ls.billings.filter(b=>b.contract_id===c.id),body=$('lsBillings');
 if(!bs.length){body.innerHTML='<tr><td colspan="6">No progress billings submitted.</td></tr>';return;}
 body.innerHTML=bs.map(b=>{
  const d=num(b.retention_amount)+num(b.advance_recovery)+num(b.tax_withheld);
  let actions='';
  if(b.status==='SUBMITTED'&&ls.permissions.VERIFY)actions+=btn('VERIFY','verify',b.id,'primary');
  if(b.status==='VERIFIED'&&ls.permissions.APPROVE)actions+=btn('GM APPROVE','approve',b.id,'primary')+btn('REJECT','reject',b.id,'danger');
  if(b.status==='SUBMITTED'&&ls.permissions.APPROVE)actions+=btn('REJECT','reject',b.id,'danger');
  return '<tr><td><strong>'+esc(b.milestone)+'</strong><small>'+esc(b.description||'')+'</small>'+proof(b.evidence_url)+'</td>'+
  '<td><strong>'+num(b.cumulative_pct).toFixed(2)+'%</strong></td>'+
  '<td><strong>'+money(b.gross_amount)+'</strong></td>'+
  '<td>'+money(d)+'<small>Retention '+money(b.retention_amount)+' • Advance '+money(b.advance_recovery)+' • Tax '+money(b.tax_withheld)+'</small></td>'+
  '<td><strong>'+money(b.payable_amount)+'</strong></td>'+
  '<td>'+badge(b.status)+'<div class="ls-action-row">'+actions+'</div>'+
  (b.decision_notes?'<small>Decision: '+esc(b.decision_notes)+'</small>':'')+'</td></tr>';
 }).join('');
}
function renderVariations(c){
 const vs=ls.variations.filter(v=>v.contract_id===c.id),body=$('lsVariations');
 if(!vs.length){body.innerHTML='<tr><td colspan="4">No variation orders.</td></tr>';return;}
 body.innerHTML=vs.map(v=>'<tr><td><strong>'+esc(v.description)+'</strong><small>'+proof(v.evidence_url)+'</small></td>'+
  '<td>'+money(v.amount_delta)+'</td><td>'+badge(v.status)+'</td>'+
  '<td>'+(v.status==='SUBMITTED'&&ls.permissions.VARIATION
    ?btn('GM APPROVE','variationApprove',v.id,'primary')+btn('REJECT','variationReject',v.id,'danger')
    :esc(v.decision_notes||'—'))+'</td></tr>').join('');
}
function renderPayments(c){
 const ps=ls.payments.filter(p=>p.contract_id===c.id),body=$('lsPayments');
 if(!ps.length){body.innerHTML='<tr><td colspan="5">No advances or payments recorded.</td></tr>';return;}
 body.innerHTML=ps.map(p=>'<tr><td>'+esc(prettyDate(p.paid_on))+'</td><td>'+badge(p.payment_kind)+'</td>'+
 '<td><strong>'+money(p.amount)+'</strong></td><td>'+esc(p.payment_method)+'<small>'+esc(p.payment_reference)+'</small></td>'+
 '<td>'+esc(p.recipient_ack||'—')+'</td></tr>').join('');
}
function projectOptions(){return [{value:'',label:'Select project'},...ls.projects.filter(p=>String(p.status||'').toUpperCase()==='ACTIVE')
 .map(p=>({value:p.project_id,label:p.project_name+' — '+p.project_id}))];}
function beginContract(){
 if(!ls.permissions.CREATE)return notify('Your role cannot create contracts.',true);
 const markup=field('PROJECT','project_id','select',{required:true,options:projectOptions()})+
  field('CONTRACT TYPE','kind','select',{required:true,options:[{value:'DIRECT_LABOR',label:'Direct Labor / Pakyaw'},{value:'SUBCONTRACTOR',label:'Independent Subcontractor'}]})+
  field('LABOR GROUP / CONTRACTOR NAME','name','text',{required:true})+
  field('SCOPE TITLE','title','text',{required:true})+
  field('SCOPE OF WORK','scope','textarea',{required:true,full:true})+
  field('CONTRACT PRICE (PHP)','amount','number',{required:true,min:.01,step:'.01'})+
  field('ADVANCE LIMIT (PHP)','advance','number',{min:0,step:'.01',value:0})+
  field('RETENTION (%)','retention','number',{min:0,max:30,step:'.01',value:0})+
  field('SIGNED DATE','signed_on','date',{required:true,value:dateNow()})+
  field('CONTRACT REFERENCE','reference','text')+
  field('SIGNED DOCUMENT LINK (HTTPS)','document','url',{full:true,help:'Paste a permitted HTTPS link to the signed contract. Do not put confidential files in public links.'})+
  field('COMPLIANCE / LICENSE / WORKER BENEFITS NOTES','compliance','textarea',{full:true,
    help:'Required for direct labor groups. Confirm wage/benefit arrangements and group roster; for subcontractors record licensing and tax checks.'});
 showModal('REGISTER LUMP-SUM CONTRACT','contract',markup,'REGISTER DRAFT');
}
function beginBilling(){
 const c=contractById(ls.selected);if(!c)return;
 const pending=ls.billings.some(b=>b.contract_id===c.id&&['SUBMITTED','VERIFIED'].includes(b.status));
 if(pending)return notify('Resolve the pending billing before creating another claim.',true);
 const s=getStats(c);
 const availableAdvance=ls.payments.filter(p=>p.contract_id===c.id&&p.payment_kind==='ADVANCE').reduce((n,p)=>n+num(p.amount),0)
   -approved(c.id).reduce((n,b)=>n+num(b.advance_recovery),0);
 const fields=field('MILESTONE / CERTIFIED SCOPE','milestone','text',{required:true,full:true})+
  field('CUMULATIVE COMPLETION (%)','pct','number',{required:true,min:.001,max:100,step:'.001',
    help:'Cumulative engineer-measured completion, not this period alone. Previously certified: '+s.certifiedPct+'%.'})+
  field('ADVANCE RECOVERY (PHP)','recovery','number',{min:0,step:'.01',value:0,help:'Unrecovered paid advance: '+money(Math.max(0,availableAdvance))})+
  field('TAX WITHHELD (PHP)','tax','number',{min:0,step:'.01',value:0,help:'Enter amount confirmed by the accountant; no assumed withholding rate.'})+
  field('SUPPORTING EVIDENCE URL (HTTPS)','evidence','url',{required:true,full:true,help:'Link to signed accomplishment certificate, measurement, or approved photos.'})+
  field('WORK DESCRIPTION','description','textarea',{full:true});
 showModal('PREPARE PROGRESS BILLING','billing',fields,'SUBMIT FOR SITE VERIFICATION');
 $('lsF_pct').addEventListener('input',previewBilling);
 $('lsF_recovery').addEventListener('input',previewBilling);
 $('lsF_tax').addEventListener('input',previewBilling);
 previewBilling();
}
function previewBilling(){
 const c=contractById(ls.selected);if(!c)return;
 const s=getStats(c),pct=num($('lsF_pct')?.value);
 if(!pct||pct>100){$('lsFormPreview').hidden=true;return;}
 const gross=Math.round((s.revised*pct/100-s.earned)*100)/100;
 const ret=Math.round(gross*num(c.retention_pct))/100;
 const rec=num($('lsF_recovery').value),tax=num($('lsF_tax').value);
 $('lsFormPreview').hidden=false;
 $('lsFormPreview').textContent='Current gross '+money(gross)+' · Retention '+money(ret)+' · Advance recovery '+money(rec)+' · Tax '+money(tax)+' · Estimated net payable '+money(gross-ret-rec-tax);
}
function beginVariation(){
 showModal('REQUEST CONTRACT VARIATION','variation',
  field('DESCRIPTION / ADDITIONAL WORK','description','textarea',{required:true,full:true})+
  field('AMOUNT CHANGE (PHP, NEGATIVE FOR REDUCTION)','delta','number',{required:true,step:'.01'})+
  field('VARIATION EVIDENCE URL (HTTPS)','evidence','url',{full:true}),
  'SUBMIT FOR GM DECISION');
}
function beginPayment(){
 const c=contractById(ls.selected);if(!c)return;
 const billOptions=approved(c.id).map(b=>({value:b.id,label:b.milestone+' — '+money(b.payable_amount)}));
 const fields=field('PAYMENT TYPE','kind','select',{required:true,options:[
   {value:'BILLING',label:'Approved progress billing'},{value:'ADVANCE',label:'Mobilization advance'},
   {value:'RETENTION',label:'Retention release (closed contracts only)'}]})+
   field('APPROVED BILLING','billing','select',{options:[{value:'',label:'Select approved billing'},...billOptions]})+
   field('PAYMENT AMOUNT (PHP)','amount','number',{required:true,step:'.01',min:.01})+
   field('PAYMENT DATE','paid_on','date',{required:true,value:dateNow()})+
   field('PAYMENT METHOD','method','select',{required:true,options:[
     {value:'BANK TRANSFER',label:'Bank transfer'}, {value:'CASH',label:'Cash'},
     {value:'CHECK',label:'Check'},{value:'OTHER',label:'Other'}]})+
   field('OFFICIAL REFERENCE NUMBER','reference','text',{required:true,help:'Unique reference for this contract; prevents duplicate recording.'})+
   field('RECEIVER / ACKNOWLEDGMENT','ack','text',{full:true});
 showModal('RECORD ACTUAL PAYMENT','payment',fields,'RECORD PAYMENT');
 $('lsF_kind').addEventListener('change',()=>{$('lsF_billing').disabled=$('lsF_kind').value!=='BILLING'});
 $('lsF_kind').dispatchEvent(new Event('change'));
}
async function decide(action,id){
 const remarks=(action==='verify')?prompt('Engineer verification notes (optional):',''):
    prompt(action.toLowerCase().includes('reject')?'Reason for rejection (required):':'GM decision notes (optional):','');
 if(remarks===null)return;
 const rejection=action.toLowerCase().includes('reject');
 if(rejection&&!String(remarks).trim())return notify('A rejection reason is required.',true);
 if(!confirm(action==='approve'?'Approve verified certified work and post project expense?':action==='variationApprove'?'Approve contract amount variation?':'Confirm '+action+'?'))return;
 try{
  if(action==='verify')await rpc('amanah_lump_verify',{p_id:id,p_notes:remarks||null});
  if(action==='approve'||action==='reject')
    await rpc('amanah_lump_decide',{p_id:id,p_approve:action==='approve',p_notes:remarks||null});
  if(action==='variationApprove'||action==='variationReject')
    await rpc('amanah_lump_variation_decide',{p_id:id,p_approve:action==='variationApprove',p_notes:remarks||null});
  notify('Decision recorded successfully.');
  await loadAll();
 }catch(e){notify(e.message||'Unable to record decision.',true);}
}
async function act(action,id){
 if(action==='open'){ls.selected=id;history.replaceState(null,'','?contract='+encodeURIComponent(id));return renderDetail();}
 if(action==='verify'||action==='approve'||action==='reject'||action==='variationApprove'||action==='variationReject')return decide(action,id);
}
async function handleForm(e){
 e.preventDefault();if(ls.saving)return;
 const v=values(),c=contractById(ls.selected);
 ls.saving=true;$('lsSubmit').disabled=true;$('lsFormError').textContent='';
 try{
  if(ls.mode==='contract'){
   const id=await rpc('amanah_lump_create',{
    p_project_id:v.project_id,p_contract_type:v.kind,p_name:v.name,p_title:v.title,
    p_scope:v.scope,p_amount:Number(v.amount),p_advance:Number(v.advance||0),
    p_retention:Number(v.retention||0),p_signed_on:v.signed_on,
    p_reference:v.reference||null,p_compliance:v.compliance||null,p_document_url:v.document||null
   });ls.selected=id;
  }
  if(ls.mode==='billing'){
   await rpc('amanah_lump_submit_billing',{
    p_contract_id:ls.selected,p_milestone:v.milestone,p_pct:Number(v.pct),p_evidence:v.evidence,
    p_description:v.description||null,p_recovery:Number(v.recovery||0),p_tax:Number(v.tax||0)
   });
  }
  if(ls.mode==='variation'){
   await rpc('amanah_lump_variation_submit',{p_id:ls.selected,p_desc:v.description,p_delta:Number(v.delta),p_evidence:v.evidence||null});
  }
  if(ls.mode==='payment'){
   await rpc('amanah_lump_record_payment',{
    p_contract_id:ls.selected,p_billing_id:v.kind==='BILLING'?v.billing:null,
    p_kind:v.kind,p_amount:Number(v.amount),p_paid_on:v.paid_on,
    p_method:v.method,p_reference:v.reference,p_ack:v.ack||null
   });
  }
  $('lsModal').classList.remove('open');$('lsModal').setAttribute('aria-hidden','true');
  ls.mode=null;notify('Saved successfully. Ledger and status refreshed.');
  await loadAll();
 }catch(err){$('lsFormError').textContent=err.message||'Unable to save record.';}
 finally{ls.saving=false;$('lsSubmit').disabled=false;}
}
async function runCritical(action){
 const c=contractById(ls.selected);if(!c)return;
 if(!confirm(action==='activate'?'GM approval: Activate this contract for certified billing?':'GM approval: Close certified 100% contract and allow retention release?'))return;
 try{
  await rpc(action==='activate'?'amanah_lump_activate':'amanah_lump_close',{p_id:c.id});
  notify('Contract status updated.');await loadAll();
 }catch(e){notify(e.message,true);}
}
async function boot(){
 const {data:{session}}=await lsDb.auth.getSession();
 if(!session){location.href='admin.html';return;}
 try{
  const actions=['CREATE','VERIFY','APPROVE','ACTIVATE','CLOSE','VARIATION','PAY'];
  const access=await Promise.all(actions.map(p_action=>rpc('amanah_lump_can',{p_action})));
  actions.forEach((a,i)=>ls.permissions[a] = access[i]===true);
  $('lsNewContract').hidden=!ls.permissions.CREATE;
  await loadAll();
 }catch(err){notify('Unable to load Lump-Sum Contracts: '+err.message,true);}
}
document.addEventListener('DOMContentLoaded',()=>{
 $('lsRefresh').addEventListener('click',()=>loadAll().catch(e=>notify(e.message,true)));
 $('lsNewContract').addEventListener('click',beginContract);
 $('lsNewBilling').addEventListener('click',beginBilling);
 $('lsNewVariation').addEventListener('click',beginVariation);
 $('lsNewPayment').addEventListener('click',beginPayment);
 $('lsActivate').addEventListener('click',()=>runCritical('activate'));
 $('lsClose').addEventListener('click',()=>runCritical('close'));
 $('lsModalClose').addEventListener('click',closeModal);
 $('lsCancel').addEventListener('click',closeModal);
 $('lsForm').addEventListener('submit',handleForm);
 $('lsContracts').addEventListener('click',e=>{const el=e.target.closest('[data-ls-action]');if(el)act(el.dataset.lsAction,el.dataset.lsId)});
 $('lsBillings').addEventListener('click',e=>{const el=e.target.closest('[data-ls-action]');if(el)act(el.dataset.lsAction,el.dataset.lsId)});
 $('lsVariations').addEventListener('click',e=>{const el=e.target.closest('[data-ls-action]');if(el)act(el.dataset.lsAction,el.dataset.lsId)});
 boot();
});
