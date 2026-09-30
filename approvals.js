const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let approvals=[];
let currentApproval=null;

function esc(v){return v==null?'':String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");}
function formatDateTime(v){if(!v)return '—';return new Date(v).toLocaleString();}
function showMsg(text,type='success'){const el=document.getElementById('approvalMessage');el.textContent=text;el.className=`message ${type}`;el.style.display='block';setTimeout(()=>{el.className='message hidden';el.textContent='';},3500);}
function closeModal(){currentApproval=null;document.getElementById('approvalModal').classList.add('hidden');document.getElementById('approvalModal').setAttribute('aria-hidden','true');}
function typeLabel(type){return type==='PURCHASE_REQUEST'?'PURCHASING':type==='MAINTENANCE'?'MAINTENANCE':'ACTIVITY CALENDAR';}
function payloadCards(a){
  const p=a.payload||{};
  const common=[
    ['REQUEST TYPE',typeLabel(a.request_type)],
    ['REQUESTED BY',a.requested_by_name||a.requester_email||'—'],
    ['SUBMITTED',formatDateTime(a.submitted_at)]
  ];
  if(a.request_type==='ACTIVITY'){
    common.push(['PROJECT',p.project_name||'—'],['ACTIVITY',p.activity||a.title||'—'],['DATE',p.activity_date||'—'],['TIME',p.time||'—'],['PRIORITY',p.priority||'NORMAL'],['EQUIPMENT',p.equipment||'—'],['MANPOWER',p.manpower??0],['DESCRIPTION',p.description||a.description||'—']);
  }else if(a.request_type==='PURCHASE_REQUEST'){
    common.push(['REQUEST NO.',p.request_no||a.title||'—'],['PROJECT',p.project_name||'—'],['LOCATION',p.project_location||'—'],['REQUESTER POSITION',p.requester_position||'—'],['NEEDED BY',p.needed_by_date||'—'],['PRIORITY',p.priority||'NORMAL'],['PURPOSE',p.purpose||'—'],['ITEMS',p.items_summary||'See Purchase Request details']);
  }else{
    common.push(['EQUIPMENT',p.equipment_name||p.equipment_id||'—'],['MAINTENANCE TYPE',p.maintenance_type||'—'],['DATE',p.maintenance_date||'—'],['PROJECT',p.project_name||'—'],['DESCRIPTION',p.description||a.description||'—'],['SUPPLIER / SHOP',p.supplier_shop||'—'],['TOTAL AMOUNT',p.total_amount==null?'—':'₱'+Number(p.total_amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})]);
  }
  return '<div class="detail-grid">'+common.map(([k,v])=>'<div class="detail-card '+(['DESCRIPTION','PURPOSE','ITEMS'].includes(k)?'full':'')+'"><label>'+esc(k)+'</label><div>'+esc(v)+'</div></div>').join('')+
    '<div class="detail-card full"><label>SUBMISSION NOTE</label><div>'+esc(a.description||'No additional notes supplied.')+'</div></div></div>';
}
async function requireAccess(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='admin.html';return false;}
  await supabaseClient.rpc('amanah_register_current_user');
  const {data:role}=await supabaseClient.rpc('amanah_get_current_role');
  const {data:permissionRows,error}=await supabaseClient.rpc('amanah_get_current_permissions');
  if(error)throw error;
  const perms=new Set((permissionRows||[]).map(x=>x.permission_key));
  if(!perms.has('approvals.view')){
    document.querySelector('.approvals-page').innerHTML='<section class="approval-panel" style="padding:45px;text-align:center"><div class="approval-kicker">ACCESS CONTROL</div><h2>APPROVAL CENTER</h2><p style="color:#64748b">Only the General Manager / Administrator can access the approval queue.</p><button class="button primary" type="button" onclick="location.href=\'dashboard.html\'">RETURN TO DASHBOARD</button></section>';
    return false;
  }
  return true;
}
async function loadApprovals(){
  const type=document.getElementById('typeFilter').value;
  let q=supabaseClient.from('amanah_approval_requests').select('*').eq('status','PENDING').order('submitted_at',{ascending:false});
  if(type)q=q.eq('request_type',type);
  const {data,error}=await q;
  if(error)throw error;
  approvals=data||[];
  render();
}
function render(){
  const counts={ACTIVITY:0,PURCHASE_REQUEST:0,MAINTENANCE:0};
  approvals.forEach(a=>counts[a.request_type]=(counts[a.request_type]||0)+1);
  document.getElementById('pendingCount').textContent=approvals.length;
  document.getElementById('activityCount').textContent=counts.ACTIVITY||0;
  document.getElementById('purchaseCount').textContent=counts.PURCHASE_REQUEST||0;
  document.getElementById('maintenanceCount').textContent=counts.MAINTENANCE||0;
  const body=document.getElementById('approvalBody');
  if(!approvals.length){body.innerHTML='<tr><td colspan="6" class="empty">No pending approvals. The General Manager approval queue is clear.</td></tr>';return;}
  body.innerHTML=approvals.map(a=>'<tr>'+
    '<td><span class="type-chip type-'+esc(a.request_type)+'">'+esc(typeLabel(a.request_type))+'</span></td>'+
    '<td><span class="request-title">'+esc(a.title)+'</span><span class="request-sub">'+esc(a.description||'')+'</span></td>'+
    '<td><span class="requester"><strong>'+esc(a.requested_by_name||'AMANAH USER')+'</strong><span>'+esc(a.requester_email||'')+'</span></span></td>'+
    '<td>'+esc(formatDateTime(a.submitted_at))+'</td>'+
    '<td><span class="pending-chip">PENDING</span></td>'+
    '<td><div class="action-group"><button class="mini review" type="button" data-review="'+esc(a.approval_id)+'">REVIEW</button></div></td>'+
  '</tr>').join('');
  body.querySelectorAll('[data-review]').forEach(btn=>btn.addEventListener('click',()=>openReview(btn.dataset.review)));
}
function openReview(id){
  const approval=approvals.find(a=>a.approval_id===id);if(!approval)return;
  currentApproval=approval;
  document.getElementById('modalTitle').textContent=typeLabel(approval.request_type)+' REVIEW';
  document.getElementById('approvalDetails').innerHTML=payloadCards(approval);
  document.getElementById('decisionRemarks').value='';
  document.getElementById('approvalModal').classList.remove('hidden');
  document.getElementById('approvalModal').setAttribute('aria-hidden','false');
}
async function decide(decision){
  if(!currentApproval)return;
  const remarks=document.getElementById('decisionRemarks').value.trim();
  if(decision==='REJECTED'&&!remarks){
    alert('Please enter the reason or instruction for rejecting this request.');
    return;
  }
  const button=document.getElementById(decision==='APPROVED'?'approveApproval':'rejectApproval');
  button.disabled=true;button.textContent=decision==='APPROVED'?'APPROVING...':'REJECTING...';
  try{
    const {error}=await supabaseClient.rpc('amanah_decide_approval',{
      p_approval_id:currentApproval.approval_id,
      p_decision:decision,
      p_remarks:remarks||null
    });
    if(error)throw error;
    closeModal();
    showMsg(decision==='APPROVED'?'Request approved successfully.':'Request rejected successfully.','success');
    await loadApprovals();
  }catch(error){
    console.error(error);showMsg(error.message||'Unable to process approval.','error');
  }finally{
    button.disabled=false;button.textContent=decision==='APPROVED'?'APPROVE REQUEST':'REJECT REQUEST';
  }
}
document.addEventListener('DOMContentLoaded',async()=>{
  try{
    if(!(await requireAccess()))return;
    document.getElementById('refreshApprovals').addEventListener('click',loadApprovals);
    document.getElementById('typeFilter').addEventListener('change',loadApprovals);
    document.getElementById('closeApprovalModal').addEventListener('click',closeModal);
    document.getElementById('cancelApproval').addEventListener('click',closeModal);
    document.getElementById('approveApproval').addEventListener('click',()=>decide('APPROVED'));
    document.getElementById('rejectApproval').addEventListener('click',()=>decide('REJECTED'));
    document.getElementById('approvalModal').addEventListener('click',e=>{if(e.target.id==='approvalModal')closeModal();});
    await loadApprovals();
  }catch(error){console.error(error);showMsg(error.message||'Unable to load approval center.','error');}
});