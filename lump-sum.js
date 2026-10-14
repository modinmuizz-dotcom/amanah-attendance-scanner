const LS_URL='https://bafmycjninxomufhkjvy.supabase.co';
const LS_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const lsDb=window.supabase.createClient(LS_URL,LS_KEY);
const ls={projects:[],contracts:[],billings:[],payments:[],variations:[],
 activationRequests:[],permissions:{},selected:null,mode:null,saving:false};
const LS_PHOTO_MAX=10;
let lsBillingPhotos=[], lsGalleryGeneration=0;
function clearBillingPhotoPreviews(){lsBillingPhotos.forEach(p=>URL.revokeObjectURL(p.preview));lsBillingPhotos=[];}
function renderBillingPhotoPreviews(){
 const root=$('lsBillingPhotoPreviews');if(!root)return;
 $('lsBillingPhotoCount').textContent=lsBillingPhotos.length+' / '+LS_PHOTO_MAX+' PHOTOS SELECTED';
 root.innerHTML=lsBillingPhotos.map(p=>
  '<div class="ls-photo-preview-card"><img src="'+esc(p.preview)+'" alt="'+esc(p.file.name)+'" loading="lazy">'+
  '<span title="'+esc(p.file.name)+'">'+esc(p.file.name)+'</span>'+
  '<button type="button" class="ls-photo-remove" data-ls-photo-remove="'+esc(p.id)+'">REMOVE</button></div>').join('');
 $('lsAddPhotosButton').disabled=lsBillingPhotos.length>=LS_PHOTO_MAX;
}
function addBillingPhotoFiles(files){
 const incoming=Array.from(files||[]);if(!incoming.length)return;
 if(incoming.length+lsBillingPhotos.length>LS_PHOTO_MAX)throw new Error('Maximum '+LS_PHOTO_MAX+' pictures per billing.');
 for(const f of incoming){
  if(!['image/jpeg','image/png','image/webp'].includes(f.type))throw new Error(f.name+': Only JPG, PNG or WEBP pictures.');
  if(!f.size||f.size>15728640)throw new Error(f.name+': Picture must be 15 MB or smaller.');
  if(lsBillingPhotos.some(p=>p.file.name===f.name&&p.file.size===f.size&&p.file.lastModified===f.lastModified))
   throw new Error(f.name+': Picture already selected.');
 }
 for(const f of incoming)lsBillingPhotos.push({id:crypto.randomUUID(),file:f,preview:URL.createObjectURL(f)});
 $('lsFormError').textContent='';
 renderBillingPhotoPreviews();
}
function removeBillingPhoto(id){
 const i=lsBillingPhotos.findIndex(p=>p.id===id);if(i<0)return;
 const [p]=lsBillingPhotos.splice(i,1);URL.revokeObjectURL(p.preview);renderBillingPhotoPreviews();
}

const $=id=>document.getElementById(id);
const esc=v=>v==null?'':String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
const num=v=>Number(v)||0;
const dateNow=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const prettyDate=s=>s?new Date(String(s).slice(0,10)+'T00:00:00').toLocaleDateString('en-PH'):'—';
const badge=s=>'<span class="ls-badge '+esc(s)+'">'+esc(s)+'</span>';
const btn=(label,action,id,tone='secondary')=>'<button class="ls-btn '+tone+'" type="button" data-ls-action="'+esc(action)+'" data-ls-id="'+esc(id)+'">'+esc(label)+'</button>';
const proof=url=>{
 const raw=String(url||'');
 if(raw.startsWith('private-evidence:')){
   const path=raw.slice('private-evidence:'.length);
   return '<button type="button" class="ls-btn secondary" data-ls-proof="'+esc(encodeURIComponent(path))+'">OPEN PRIVATE EVIDENCE ↗</button>';
 }
 return /^https:\/\//i.test(raw)
   ? '<a class="ls-proof" href="'+esc(raw)+'" target="_blank" rel="noopener noreferrer">View evidence ↗</a>'
   : 'No evidence link';
};

async function uploadEvidence(url,file,required=false){
 const raw=String(url||'').trim();
 if(file && file.size>0){
   if(file.size>15728640)throw new Error('Evidence file must be 15 MB or smaller.');
   const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
   if(!allowed.includes(file.type))throw new Error('Evidence must be a PDF, JPG, PNG or WEBP file.');
   const user= (await lsDb.auth.getUser()).data?.user;
   if(!user?.id)throw new Error('Sign in before uploading evidence.');
   const clean=String(file.name||'attachment').replace(/[^a-z0-9._-]/gi,'_').slice(-90);
   const path=user.id+'/'+crypto.randomUUID()+'-'+clean;
   const {error}=await lsDb.storage.from('amanah-lump-evidence')
     .upload(path,file,{contentType:file.type,upsert:false});
   if(error)throw new Error('Private evidence upload failed: '+error.message);
   return 'private-evidence:'+path;
 }
 if(raw && !/^https:\/\//i.test(raw))throw new Error('Evidence links must begin with https://');
 if(required && !raw)throw new Error('Attach a file or supply an HTTPS evidence link.');
 return raw||null;
}

const field=(label,name,type='text',opts={})=>{
 const full=opts.full?' full':'';
 const id='lsF_'+name;
 const common=' id="'+id+'" name="'+name+'" '+(opts.required?'required':'')+' '+(opts.step?'step="'+opts.step+'"':'')+' '+(opts.min!==undefined?'min="'+opts.min+'"':'')+' '+(opts.max!==undefined?'max="'+opts.max+'"':'')+' ';
 const initial=opts.value===undefined?'':String(opts.value);
 let content;
 if(type==='select'){content='<select'+common+'>'+opts.options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('')+'</select>';}
 else if(type==='textarea'){content='<textarea'+common+' rows="3" placeholder="'+esc(opts.placeholder||'')+'">'+esc(initial)+'</textarea>';}
 else if(type==='file'){
  // Attachments remain unsaved until the form is submitted and can be cleared.
  content='<div class="ls-file-controls">'+
    '<input type="file"'+common+
    'accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" data-ls-attachment>'+
    '<button type="button" class="ls-file-remove" data-ls-clear-file="'+esc(id)+'" aria-label="Remove selected attachment" hidden>REMOVE ATTACHMENT</button>'+
    '</div><span class="ls-file-selected" aria-live="polite" hidden></span>';
 }
 else content='<input type="'+type+'"'+common+' value="'+esc(initial)+'" placeholder="'+esc(opts.placeholder||'')+'">';
 return '<div class="ls-field'+full+'"><label for="'+id+'">'+esc(label)+(opts.required?' *':'')+'</label>'+content+(opts.help?'<small>'+esc(opts.help)+'</small>':'')+'</div>';
};
function notify(t,bad=false){$('lsMessage').hidden=false;$('lsMessage').textContent=t;$('lsMessage').className='ls-message'+(bad?' error':'');}
function clearNotify(){$('lsMessage').hidden=true;}
function showModal(title,mode,html,submitLabel='SAVE'){
 clearBillingPhotoPreviews();
 ls.mode=mode;$('lsModalTitle').textContent=title;$('lsFormFields').innerHTML=html;
 $('lsSubmit').textContent=submitLabel;$('lsFormError').textContent='';
 $('lsFormPreview').hidden=true;
 $('lsModal').classList.add('open');$('lsModal').setAttribute('aria-hidden','false');
 $('lsFormFields').querySelector('input,select,textarea')?.focus();
}
function syncSelectedAttachment(input){
 if(!input || input.type!=='file')return;
 const fieldRoot=input.closest('.ls-field');
 if(!fieldRoot)return;
 const removeButton=fieldRoot.querySelector('[data-ls-clear-file]');
 const status=fieldRoot.querySelector('.ls-file-selected');
 const selectedFile=input.files?.[0]||null;
 if(removeButton)removeButton.hidden=!selectedFile;
 if(status){
  status.hidden=!selectedFile;
  status.textContent=selectedFile?'Selected: '+selectedFile.name:'';
 }
}
function clearSelectedAttachment(button){
 if(!button)return;
 const input=document.getElementById(button.dataset.lsClearFile);
 if(!input || input.type!=='file')return;
 // Clearing the native input also prevents upload when this form is submitted.
 input.value='';
 syncSelectedAttachment(input);
}
function closeModal(){if(ls.saving)return;clearBillingPhotoPreviews();$('lsModal').classList.remove('open');$('lsModal').setAttribute('aria-hidden','true');ls.mode=null;}
function values(){return Object.fromEntries(new FormData($('lsForm')).entries());}
async function rpc(fn,args){const {data,error}=await lsDb.rpc(fn,args||{});if(error)throw error;return data;}
async function loadAll(){
 const [projects,contracts,billings,payments,variations,activations]=await Promise.all([
  lsDb.from('projects').select('project_id,project_name,status').order('project_name'),
  lsDb.from('amanah_lump_contracts').select('*').order('created_at',{ascending:false}),
  lsDb.from('amanah_lump_billings').select('*').order('submitted_at',{ascending:false}),
  lsDb.from('amanah_lump_payments').select('*').order('created_at',{ascending:false}),
  lsDb.from('amanah_lump_variations').select('*').order('submitted_at',{ascending:false}),
  lsDb.from('amanah_lump_activation_requests').select('*').order('submitted_at',{ascending:false})
 ]);
 for(const x of [projects,contracts,billings,payments,variations,activations])if(x.error)throw x.error;
 ls.projects=projects.data||[];ls.contracts=contracts.data||[];ls.billings=billings.data||[];
 ls.payments=payments.data||[];ls.variations=variations.data||[];
 ls.activationRequests=activations.data||[];
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
function closeContractView(){
  // Close only the open details panel. Keep the saved contract and status untouched.
  const openContractId=ls.selected;
  ls.selected=null;
  $('lsDetailPanel').hidden=true;

  // The page can be opened with ?contract= or ?billing=. Remove both so refresh
  // doesn't reopen this contract after the user has closed the view.
  const url=new URL(window.location.href);
  url.searchParams.delete('contract');
  url.searchParams.delete('billing');
  window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);

  const register=$('lsContractRegister');
  if(register){
    register.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  // Restore keyboard focus to the register action for the contract just viewed.
  const opener=Array.from($('lsContracts').querySelectorAll('[data-ls-action="open"]'))
    .find(button=>button.dataset.lsId===openContractId);
  (opener||$('lsRefresh')).focus();
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
 const compliance=c.contract_type==='DIRECT_LABOR'
  ? 'DIRECT LABOR: Pakyaw payments do not replace employee-level minimum wage, benefits and worker records. Compliance note: '+(c.compliance_notes||'No note recorded')
  : 'SUBCONTRACTOR: Maintain written scope, contractor registration/license where applicable, tax documentation, and payment acknowledgment. '+(c.compliance_notes||'');
 $('lsCompliance').innerHTML=esc(compliance)+'<div style="margin-top:8px">SIGNED CONTRACT: '+proof(c.document_url)+'</div>';
 const lastRequest=ls.activationRequests.find(r=>r.contract_id===c.id);
 const sendButton=$('lsActivate');
 sendButton.hidden=!(['DRAFT','REJECTED'].includes(c.status)&&ls.permissions.CREATE);
 sendButton.textContent=c.status==='REJECTED'?'RESUBMIT FOR APPROVAL':'SEND FOR APPROVAL';
 const notice=$('lsActivationNotice');
 notice.hidden=false;
 if(c.status==='DRAFT'){
   notice.textContent='DRAFT — Contract saved but not yet submitted. Click SEND FOR APPROVAL to request activation.';
 }else if(c.status==='PENDING_APPROVAL'){
   notice.textContent='PENDING GM APPROVAL — Submitted'+(lastRequest?.submitted_at?' on '+prettyDate(lastRequest.submitted_at):'')+'. Progress billing will become available only after GM approval.';
 }else if(c.status==='REJECTED'){
   notice.textContent='GM REJECTED — '+(lastRequest?.decision_notes||'Please review the contract details before resubmission.');
 }else if(c.status==='ACTIVE'){
   notice.textContent='ACTIVE — Contract approved by the General Manager. Progress billings are enabled.';
 }else{
   notice.textContent='CLOSED — Contract billing has been completed and closed.';
 }
 notice.className='ls-activation-notice '+String(c.status).toLowerCase();
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
  const photos=Array.isArray(b.evidence_photos)?b.evidence_photos:[];
  const gallery=photos.length?
    '<button type="button" class="ls-btn ls-view-gallery" data-ls-view-photos="'+esc(b.id)+'">VIEW PHOTOS ('+photos.length+')</button>':'';
  const primary=photos.includes(b.evidence_url)?'':proof(b.evidence_url);
  let actions='';
  if(b.status==='SUBMITTED'&&ls.permissions.VERIFY)actions+=btn('VERIFY','verify',b.id,'primary');
  // Site verification stays with the Engineer. GM decisions are performed
  // exclusively from the separate Approval Center, never from this module.
  if(b.status==='VERIFIED')actions+='<span class="ls-gm-queue-note">AWAITING GM DECISION IN APPROVAL CENTER</span>';
  return '<tr><td><strong>'+esc(b.milestone)+'</strong><small>'+esc(b.description||'')+'</small>'+primary+gallery+'</td>'+
  '<td><strong>'+num(b.cumulative_pct).toFixed(2)+'%</strong></td>'+
  '<td><strong>'+money(b.gross_amount)+'</strong></td>'+
  '<td>'+money(d)+'<small>Retention '+money(b.retention_amount)+' • Advance '+money(b.advance_recovery)+(num(b.tax_withheld)>0?' • Historical tax '+money(b.tax_withheld):'')+'</small></td>'+
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
  field('UPLOAD SIGNED CONTRACT (PDF / IMAGE)','document_file','file',{full:true,help:'Private upload up to 15 MB; signed access link used for authorized users.'})+
  field('OR SIGNED DOCUMENT LINK (HTTPS)','document','url',{full:true,help:'Use a secure HTTPS link only if the file is already stored elsewhere.'})+
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
  field('UPLOAD ACCOMPLISHMENT EVIDENCE (PDF / IMAGE)','evidence_file','file',{full:true,help:'Main PDF or image. You may add additional pictures below.'})+
  '<div class="ls-field full ls-extra-photos"><label>ADDITIONAL PHOTO EVIDENCE</label>'+
  '<div class="ls-add-photos-row"><button type="button" id="lsAddPhotosButton" class="ls-btn primary">+ ADD PHOTO EVIDENCE</button>'+
  '<span id="lsBillingPhotoCount" class="ls-photo-count" aria-live="polite">0 / 10 PHOTOS SELECTED</span></div>'+
  '<input id="lsAddPhotoInput" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden>'+
  '<div id="lsBillingPhotoPreviews" class="ls-photo-previews"></div>'+
  '<small>Up to 10 pictures (15 MB each). Preview and remove pictures before submitting. All photos are visible to reviewers.</small></div>'+
  field('OR SUPPORTING EVIDENCE URL (HTTPS)','evidence','url',{full:true,help:'Link to certificate, measurement or approved activity photos.'})+
  field('WORK DESCRIPTION','description','textarea',{full:true});
 showModal('PREPARE PROGRESS BILLING','billing',fields,'SUBMIT FOR SITE VERIFICATION');
 $('lsF_pct').addEventListener('input',previewBilling);
 $('lsF_recovery').addEventListener('input',previewBilling);
 previewBilling();
}
function previewBilling(){
 const c=contractById(ls.selected);if(!c)return;
 const s=getStats(c),pct=num($('lsF_pct')?.value);
 if(!pct||pct>100){$('lsFormPreview').hidden=true;return;}
 const gross=Math.round((s.revised*pct/100-s.earned)*100)/100;
 const ret=Math.round(gross*num(c.retention_pct))/100;
 const rec=num($('lsF_recovery').value);
 $('lsFormPreview').hidden=false;
 $('lsFormPreview').textContent='Current gross '+money(gross)+' · Retention '+money(ret)+' · Advance recovery '+money(rec)+' · Estimated net payable '+money(gross-ret-rec);
}
function beginVariation(){
 showModal('REQUEST CONTRACT VARIATION','variation',
  field('DESCRIPTION / ADDITIONAL WORK','description','textarea',{required:true,full:true})+
  field('AMOUNT CHANGE (PHP, NEGATIVE FOR REDUCTION)','delta','number',{required:true,step:'.01'})+
  field('UPLOAD VARIATION EVIDENCE (PDF / IMAGE)','evidence_file','file',{full:true})+
  field('OR VARIATION EVIDENCE LINK (HTTPS)','evidence','url',{full:true}),
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

let lsConfirmationOpen=false;
function confirmLumpAction(opts={}){
 if(lsConfirmationOpen)return Promise.resolve({confirmed:false,notes:''});
 lsConfirmationOpen=true;
 const overlay=$('lsConfirmOverlay'), dialog=overlay.querySelector('.ls-confirm-dialog');
 const close=$('lsConfirmClose'), cancel=$('lsConfirmCancel'), accept=$('lsConfirmAccept');
 const textarea=$('lsConfirmNotes'), notesWrap=$('lsConfirmNotesWrap'), error=$('lsConfirmError');
 const previousFocus=document.activeElement, withNotes=Boolean(opts.notesLabel);
 dialog.dataset.tone=opts.tone||'info';
 $('lsConfirmIcon').textContent=opts.tone==='danger'?'!':'✓';
 $('lsConfirmTitle').textContent=opts.title||'Confirm action';
 $('lsConfirmMessage').textContent=opts.message||'Please confirm your action.';
 $('lsConfirmContext').hidden=!opts.context;
 $('lsConfirmContext').textContent=opts.context||'';
 notesWrap.hidden=!withNotes;
 $('lsConfirmNotesLabel').textContent=opts.notesLabel||'Remarks';
 textarea.value='';
 textarea.placeholder=opts.notesRequired?'Enter the required reason...':'Optional remarks...';
 textarea.required=!!opts.notesRequired;
 error.hidden=true;error.textContent='';
 accept.textContent=opts.confirmLabel||'CONFIRM';
 overlay.classList.add('is-open');
 overlay.setAttribute('aria-hidden','false');
 (withNotes?textarea:accept).focus();
 return new Promise(resolve=>{
  let finished=false;
  const finish=confirmed=>{
   if(finished)return;
   finished=true;
   const notes=confirmed&&withNotes?textarea.value.trim():'';
   overlay.removeEventListener('click',backdropClick);
   cancel.removeEventListener('click',onCancel);
   close.removeEventListener('click',onCancel);
   accept.removeEventListener('click',onAccept);
   document.removeEventListener('keydown',onKeys);
   overlay.classList.remove('is-open');
   overlay.setAttribute('aria-hidden','true');
   lsConfirmationOpen=false;
   if(previousFocus?.focus)previousFocus.focus();
   resolve({confirmed,notes});
  };
  const onCancel=()=>finish(false);
  const onAccept=()=>{
   if(opts.notesRequired&&!textarea.value.trim()){
    error.textContent='Please enter the reason before proceeding.';
    error.hidden=false;
    textarea.focus();
    return;
   }
   finish(true);
  };
  const backdropClick=event=>{if(event.target===overlay)finish(false);};
  const onKeys=event=>{
   if(event.key==='Escape'){event.preventDefault();finish(false);}
   if(event.key==='Tab'){
    const controls=[close,...(withNotes?[textarea]:[]),cancel,accept];
    const index=controls.indexOf(document.activeElement);
    if(event.shiftKey&&index<=0){event.preventDefault();accept.focus();}
    else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();close.focus();}
   }
  };
  overlay.addEventListener('click',backdropClick);
  cancel.addEventListener('click',onCancel);
  close.addEventListener('click',onCancel);
  accept.addEventListener('click',onAccept);
  document.addEventListener('keydown',onKeys);
 });
}


async function openBillingGallery(billingId){
 const billing=ls.billings.find(b=>b.id===billingId);
 const photos=Array.isArray(billing?.evidence_photos)?billing.evidence_photos:[];
 if(!photos.length)return notify('No photo evidence is available for this billing.',true);
 const current=++lsGalleryGeneration,overlay=$('lsPhotoGallery');
 $('lsPhotoGalleryTitle').textContent='PHOTO EVIDENCE • '+billing.milestone;
 const root=$('lsPhotoGalleryImages');
 root.textContent='Loading secure photo previews...';
 overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');
 $('lsPhotoGalleryClose').focus();
 const results=await Promise.all(photos.map(async(reference,index)=>{
  if(typeof reference!=='string'||!reference.startsWith('private-evidence:')){
    return {error:'Invalid private image reference',index};
  }
  const path=reference.slice('private-evidence:'.length);
  const {data,error}=await lsDb.storage.from('amanah-lump-evidence').createSignedUrl(path,300);
  return error?{error:error.message,index}:{url:data.signedUrl,index};
 })).catch(e=>photos.map((_,index)=>({error:e.message||'Unable to load photo',index})));
 if(current!==lsGalleryGeneration)return;
 root.innerHTML=results.map(item=>item.error?
  '<div class="ls-gallery-error">Photo '+(item.index+1)+': '+esc(item.error)+'</div>':
  '<a class="ls-gallery-photo" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+
  '<img src="'+esc(item.url)+'" alt="Billing photo evidence '+(item.index+1)+'" loading="lazy">'+
  '<span>PHOTO '+(item.index+1)+' • OPEN FULL IMAGE ↗</span></a>').join('');
}
function closeBillingGallery(){
 lsGalleryGeneration++;
 const dialog=$('lsPhotoGallery');
 dialog.classList.remove('is-open');dialog.setAttribute('aria-hidden','true');
 $('lsPhotoGalleryImages').textContent='';
}

async function decide(action,id){
 const reject=action==='reject'||action==='variationReject';
 const verify=action==='verify';
 const variationAction=action.startsWith('variation');
 const billing=variationAction?null:ls.billings.find(b=>b.id===id);
 const variation=variationAction?ls.variations.find(v=>v.id===id):null;
 const contract=contractById(variationAction?variation?.contract_id:billing?.contract_id);
 const title=verify?'Verify Site Accomplishment':reject?
  'Reject '+(variationAction?'Variation Order':'Progress Billing'):
  variationAction?'Approve Variation Order':'Approve Progress Billing';
 const message=verify
  ?'Confirm the accomplished work and supporting evidence have been verified by the Site Engineer.'
  :reject?'This will reject the request. Please provide a reason for the approval record.'
  :variationAction?'Approve the variation and update the revised contract value?'
  :'Approve this verified billing and post its earned cost to Project Cost Control?';
 const context=(contract?.scope_title||'Lump-Sum Contract')+
   (billing?' • '+billing.milestone+' • '+money(billing.gross_amount):'')+
   (variation?' • '+variation.description+' • '+money(variation.amount_delta):'');
 const response=await confirmLumpAction({
   title,message,context,tone:reject?'danger':verify?'info':'success',
   confirmLabel:reject?'REJECT REQUEST':verify?'VERIFY WORK':'APPROVE REQUEST',
   notesLabel:reject?'REJECTION REASON (REQUIRED)':verify?'ENGINEER NOTES (OPTIONAL)':'GM NOTES (OPTIONAL)',
   notesRequired:reject
 });
 if(!response.confirmed)return;
 try{
  const remarks=response.notes||null;
  if(verify)await rpc('amanah_lump_verify',{p_id:id,p_notes:remarks});
  // GM billing decisions are handled only by approvals.js in the Approval Center.
  if(variationAction)
   await rpc('amanah_lump_variation_decide',{p_id:id,p_approve:action==='variationApprove',p_notes:remarks});
  notify('Decision recorded successfully.');
  await loadAll();
 }catch(e){notify(e.message||'Unable to record decision.',true);}
}
async function act(action,id){
 if(action==='open'){ls.selected=id;history.replaceState(null,'','?contract='+encodeURIComponent(id));return renderDetail();}
 if(action==='verify'||action==='variationApprove'||action==='variationReject')return decide(action,id);
}
async function handleForm(e){
 e.preventDefault();if(ls.saving)return;
 const v=values(),c=contractById(ls.selected);
 if(ls.mode==='payment'){
  const response=await confirmLumpAction({
   title:'Confirm Payment Release',
   message:'Confirm this amount was ACTUALLY PAID. Recording it will update the contract payment ledger and post exactly the paid amount to Project Cost. Unpaid certified billings remain excluded.',
   context:money(v.amount)+' • '+(v.kind||'PAYMENT')+' • Reference: '+(v.reference||'Not provided'),
   confirmLabel:'RECORD PAYMENT',tone:'success'
  });
  if(!response.confirmed)return;
 }
 ls.saving=true;$('lsSubmit').disabled=true;$('lsFormError').textContent='';
 try{
  if(ls.mode==='contract'){
   const documentUrl=await uploadEvidence(v.document,v.document_file,false);
   const id=await rpc('amanah_lump_create',{
    p_project_id:v.project_id,p_contract_type:v.kind,p_name:v.name,p_title:v.title,
    p_scope:v.scope,p_amount:Number(v.amount),p_advance:Number(v.advance||0),
    p_retention:Number(v.retention||0),p_signed_on:v.signed_on,
    p_reference:v.reference||null,p_compliance:v.compliance||null,p_document_url:documentUrl
   });ls.selected=id;
  }
  if(ls.mode==='billing'){
   const evidenceUrl=await uploadEvidence(v.evidence,v.evidence_file,lsBillingPhotos.length===0);
   const photoEvidence=[];
   for(const photo of lsBillingPhotos)photoEvidence.push(await uploadEvidence('',photo.file,true));
   await rpc('amanah_lump_submit_billing_with_photos',{
    p_contract_id:ls.selected,p_milestone:v.milestone,p_pct:Number(v.pct),p_evidence:evidenceUrl,
    p_description:v.description||null,p_recovery:Number(v.recovery||0),p_tax:0,p_photos:photoEvidence
   });
  }
  if(ls.mode==='variation'){
   const evidenceUrl=await uploadEvidence(v.evidence,v.evidence_file,false);
   await rpc('amanah_lump_variation_submit',{p_id:ls.selected,p_desc:v.description,p_delta:Number(v.delta),p_evidence:evidenceUrl});
  }
  if(ls.mode==='payment'){
   await rpc('amanah_lump_record_payment',{
    p_contract_id:ls.selected,p_billing_id:v.kind==='BILLING'?v.billing:null,
    p_kind:v.kind,p_amount:Number(v.amount),p_paid_on:v.paid_on,
    p_method:v.method,p_reference:v.reference,p_ack:v.ack||null
   });
  }
  $('lsModal').classList.remove('open');$('lsModal').setAttribute('aria-hidden','true');
  clearBillingPhotoPreviews();const wasPayment=ls.mode==='payment';ls.mode=null;
  notify(wasPayment
    ? 'Payment recorded. The paid amount has been added once to the assigned project\'s actual Lump-Sum labor cost.'
    : 'Saved successfully. Unpaid progress billings are not added to Project Cost.');
  await loadAll();
 }catch(err){$('lsFormError').textContent=err.message||'Unable to save record.';}
 finally{ls.saving=false;$('lsSubmit').disabled=false;}
}
async function runCritical(action){
 const c=contractById(ls.selected);if(!c)return;
 const submitting=action==='activate';
 if(submitting&&!['DRAFT','REJECTED'].includes(c.status)){
   notify('This contract cannot be submitted in its current status.',true);
   return;
 }
 const response=await confirmLumpAction({
   title:submitting?'Send Contract for Approval':'Close Lump-Sum Contract',
   message:submitting
     ?'Submit this saved contract to the General Manager for review? Activation and progress billing will remain locked until it is approved.'
     :'GM authorization: Close this certified contract and allow retention release once financial conditions are satisfied?',
   context:c.scope_title+' • '+c.contractor_name+' • '+money(revised(c)),
   confirmLabel:submitting?'SEND FOR APPROVAL':'CLOSE CONTRACT',
   tone:submitting?'info':'success'
 });
 if(!response.confirmed)return;
 const button=$(submitting?'lsActivate':'lsClose');
 if(button)button.disabled=true;
 try{
   if(submitting){
     await rpc('amanah_lump_submit_activation',{p_contract_id:c.id});
     notify('Contract submitted to the GM Approval Center. Awaiting approval before activation.');
   }else{
     await rpc('amanah_lump_close',{p_id:c.id});
     notify('Contract closed successfully.');
   }
   await loadAll();
 }catch(e){
   notify(e.message||'Unable to update contract status.',true);
 }finally{
   if(button)button.disabled=false;
 }
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
 $('lsCloseView').addEventListener('click',closeContractView);
 $('lsModalClose').addEventListener('click',closeModal);
 $('lsCancel').addEventListener('click',closeModal);
 $('lsForm').addEventListener('submit',handleForm);
 // Handle all dynamically generated contract, billing and variation file fields.
 $('lsFormFields').addEventListener('change',e=>{
  if(e.target.matches('input[type="file"][data-ls-attachment]'))syncSelectedAttachment(e.target);
  if(e.target.id==='lsAddPhotoInput'){
   try{addBillingPhotoFiles(e.target.files);}
   catch(error){$('lsFormError').textContent=error.message;}
   e.target.value='';
  }
 });
 $('lsFormFields').addEventListener('click',e=>{
  if(e.target.closest('#lsAddPhotosButton'))$('lsAddPhotoInput')?.click();
  const remove=e.target.closest('[data-ls-photo-remove]');
  if(remove)removeBillingPhoto(remove.dataset.lsPhotoRemove);
  const button=e.target.closest('[data-ls-clear-file]');
  if(button)clearSelectedAttachment(button);
 });
 document.addEventListener('click',async e=>{
   const target=e.target.closest('[data-ls-proof]');
   if(!target)return;
   // Open a blank tab synchronously before generating a short-lived signed URL.
   const tab=window.open('about:blank','_blank');
   if(tab)tab.opener=null;
   try{
     const path=decodeURIComponent(target.dataset.lsProof);
     const {data,error}=await lsDb.storage.from('amanah-lump-evidence').createSignedUrl(path,300);
     if(error)throw error;
     if(tab)tab.location.href=data.signedUrl;
     else window.location.assign(data.signedUrl);
   }catch(err){if(tab)tab.close();notify('Unable to open private evidence: '+err.message,true);}
 });
 $('lsContracts').addEventListener('click',e=>{const el=e.target.closest('[data-ls-action]');if(el)act(el.dataset.lsAction,el.dataset.lsId)});
 $('lsBillings').addEventListener('click',e=>{
  const viewer=e.target.closest('[data-ls-view-photos]');
  if(viewer){openBillingGallery(viewer.dataset.lsViewPhotos);return;}
  const action=e.target.closest('[data-ls-action]');
  if(action)act(action.dataset.lsAction,action.dataset.lsId);
 });
 $('lsPhotoGalleryClose').addEventListener('click',closeBillingGallery);
 $('lsPhotoGallery').addEventListener('click',e=>{
  if(e.target.id==='lsPhotoGallery')closeBillingGallery();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('lsPhotoGallery').classList.contains('is-open'))closeBillingGallery();
 });
 $('lsVariations').addEventListener('click',e=>{const el=e.target.closest('[data-ls-action]');if(el)act(el.dataset.lsAction,el.dataset.lsId)});
 boot();
});
