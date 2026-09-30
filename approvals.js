const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let approvals=[];
let currentApproval=null;
let approvalHistory=[];
let currentHistoryRecord=null;

function esc(v){return v==null?'':String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");}
function formatDateTime(v){if(!v)return '—';return new Date(v).toLocaleString();}
function showMsg(text,type='success'){const el=document.getElementById('approvalMessage');el.textContent=text;el.className=`message ${type}`;el.style.display='block';setTimeout(()=>{el.className='message hidden';el.textContent='';},3500);}
function closeModal(){currentApproval=null;document.getElementById('approvalModal').classList.add('hidden');document.getElementById('approvalModal').setAttribute('aria-hidden','true');}
function closeHistoryModal(){
  currentHistoryRecord=null;
  document.getElementById('historyModal').classList.add('hidden');
  document.getElementById('historyModal').setAttribute('aria-hidden','true');
}
function typeLabel(type){return type==='PURCHASE_REQUEST'?'PURCHASING':type==='MAINTENANCE'?'MAINTENANCE':'ACTIVITY CALENDAR';}
function detailCard(label,value,opts={}){
  const full=opts.full?' detail-card-full':'';
  const accent=opts.accent?' detail-card-accent-'+opts.accent:'';
  return '<div class="detail-card'+full+accent+'"><div class="detail-label">'+esc(label)+'</div><div class="detail-value">'+esc(value==null||value===''?'—':value)+'</div></div>';
}

function payloadCards(a, historical=false){
  const p=a.payload||{};
  const type=typeLabel(a.request_type);

  if(a.request_type==='ACTIVITY'){
    const equipment=String(p.equipment||'—').split(',').map(x=>x.trim()).filter(Boolean);
    return `
      <div class="review-summary">
        <div class="review-summary-main">
          <div class="review-summary-kicker">REQUEST TYPE</div>
          <h3>ACTIVITY CALENDAR</h3>
          <p>Activity submitted for General Manager approval before scheduling.</p>
        </div>
        <div class="review-status ${historical ? 'review-status-'+String(a.status||'').toLowerCase() : ''}"><span></span><strong>${esc(historical ? (a.status||'DECISION RECORDED') : 'PENDING APPROVAL')}</strong><small>${esc(historical ? 'Decision recorded' : 'Awaiting decision')}</small></div>
      </div>

      <div class="review-section">
        <div class="review-section-title"><span>01</span><div><strong>REQUEST INFORMATION</strong><small>Submission and accountability details</small></div></div>
        <div class="detail-grid detail-grid-3">
          ${detailCard('REQUESTED BY',a.requested_by_name||a.requester_email)}
          ${detailCard('SUBMITTED',formatDateTime(a.submitted_at))}
          ${detailCard('PRIORITY',p.priority||'NORMAL',{accent:(p.priority||'NORMAL').toLowerCase()})}
        </div>
      </div>

      <div class="review-section">
        <div class="review-section-title"><span>02</span><div><strong>ACTIVITY DETAILS</strong><small>Planned site work information</small></div></div>
        <div class="detail-grid detail-grid-2">
          ${detailCard('PROJECT',p.project_name)}
          ${detailCard('ACTIVITY',p.activity||a.title)}
          ${detailCard('ACTIVITY DATE',p.activity_date)}
          ${detailCard('TIME',p.time)}
          ${detailCard('MANPOWER',p.manpower??0)}
          ${detailCard('EQUIPMENT',equipment.length?equipment.join(', '):'—',{full:true})}
          ${detailCard('DESCRIPTION',p.description||a.description||'No additional description provided.',{full:true})}
        </div>
      </div>

      <div class="review-section review-section-last">
        <div class="review-section-title"><span>03</span><div><strong>SUBMISSION NOTE</strong><small>Origin of the approval request</small></div></div>
        <div class="submission-note">${esc(a.description||'This activity was submitted for General Manager approval.')}</div>
      </div>
    `;
  }

  const commonHeader=`
    <div class="review-summary">
      <div class="review-summary-main">
        <div class="review-summary-kicker">REQUEST TYPE</div>
        <h3>${esc(type)}</h3>
        <p>${esc(a.title||'Request submitted for General Manager approval.')}</p>
      </div>
      <div class="review-status ${historical ? 'review-status-'+String(a.status||'').toLowerCase() : ''}"><span></span><strong>${esc(historical ? (a.status||'DECISION RECORDED') : 'PENDING APPROVAL')}</strong><small>${esc(historical ? 'Decision recorded' : 'Awaiting decision')}</small></div>
    </div>`;

  if(a.request_type==='PURCHASE_REQUEST'){
    return commonHeader+`
      <div class="review-section">
        <div class="review-section-title"><span>01</span><div><strong>REQUEST INFORMATION</strong><small>Purchase request summary</small></div></div>
        <div class="detail-grid detail-grid-3">
          ${detailCard('REQUEST NO.',p.request_no||a.title)}
          ${detailCard('REQUESTED BY',a.requested_by_name||p.requester_name||a.requester_email)}
          ${detailCard('SUBMITTED',formatDateTime(a.submitted_at))}
          ${detailCard('PROJECT',p.project_name)}
          ${detailCard('LOCATION',p.project_location)}
          ${detailCard('NEEDED BY',p.needed_by_date)}
          ${detailCard('PRIORITY',p.priority||'NORMAL')}
          ${detailCard('REQUESTER POSITION',p.requester_position)}
          ${detailCard('PURPOSE',p.purpose||'—',{full:true})}
          ${detailCard('ITEMS',p.items_summary||'See Purchase Request details',{full:true})}
        </div>
      </div>`;
  }

  return commonHeader+`
    <div class="review-section">
      <div class="review-section-title"><span>01</span><div><strong>MAINTENANCE REQUEST</strong><small>Equipment maintenance details</small></div></div>
      <div class="detail-grid detail-grid-3">
        ${detailCard('EQUIPMENT',p.equipment_name||p.equipment_id)}
        ${detailCard('MAINTENANCE TYPE',p.maintenance_type)}
        ${detailCard('DATE',p.maintenance_date)}
        ${detailCard('PROJECT',p.project_name)}
        ${detailCard('SUPPLIER / SHOP',p.supplier_shop)}
        ${detailCard('TOTAL AMOUNT',p.total_amount==null?'—':'₱'+Number(p.total_amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}))}
        ${detailCard('DESCRIPTION',p.description||a.description||'No additional description provided.',{full:true})}
      </div>
    </div>`;
}

function historyDetailHtml(a){
  const p=a.payload||{};
  const base=payloadCards(a, true);
  const decision=a.status||'—';
  const decisionClass=decision.toLowerCase();
  const decidedBy=a.decided_by_name||'—';
  const decidedAt=formatDateTime(a.decided_at);
  const remarks=a.decision_remarks||'No decision remarks were recorded.';
  return base+`
    <div class="review-section review-section-last">
      <div class="review-section-title"><span>04</span><div><strong>DECISION RECORD</strong><small>Final approval action recorded by the system</small></div></div>
      <div class="history-decision-grid">
        <div class="history-decision-card ${esc(decisionClass)}"><div class="detail-label">DECISION</div><div class="detail-value">${esc(decision)}</div></div>
        <div class="history-decision-card"><div class="detail-label">DECIDED BY</div><div class="detail-value">${esc(decidedBy)}</div></div>
        <div class="history-decision-card"><div class="detail-label">DECISION DATE</div><div class="detail-value">${esc(decidedAt)}</div></div>
        <div class="history-decision-card history-decision-full"><div class="detail-label">REVIEW REMARKS</div><div class="detail-value">${esc(remarks)}</div></div>
      </div>
    </div>`;
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
async function loadHistory(){
  const type=document.getElementById('historyTypeFilter').value;
  const status=document.getElementById('historyStatusFilter').value;
  let q=supabaseClient.from('amanah_approval_requests').select('*').neq('status','PENDING').order('decided_at',{ascending:false}).order('submitted_at',{ascending:false}).limit(200);
  if(type)q=q.eq('request_type',type);
  if(status)q=q.eq('status',status);
  const {data,error}=await q;
  if(error)throw error;
  approvalHistory=data||[];
  renderHistory();
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
function renderHistory(){
  const approved=approvalHistory.filter(a=>a.status==='APPROVED').length;
  const rejected=approvalHistory.filter(a=>a.status==='REJECTED').length;
  document.getElementById('historyTotal').textContent=approvalHistory.length;
  document.getElementById('historyApproved').textContent=approved;
  document.getElementById('historyRejected').textContent=rejected;
  const body=document.getElementById('historyBody');
  if(!approvalHistory.length){
    body.innerHTML='<tr><td colspan="7" class="empty">No completed approval decisions found for the selected filters.</td></tr>';
    return;
  }
  body.innerHTML=approvalHistory.map(a=>{
    const decision=a.status||'—';
    const decisionClass=decision==='APPROVED'?'history-approved':decision==='REJECTED'?'history-rejected':'history-other';
    return '<tr>'+
      '<td><span class="type-chip type-'+esc(a.request_type)+'">'+esc(typeLabel(a.request_type))+'</span></td>'+
      '<td><span class="request-title">'+esc(a.title)+'</span><span class="request-sub">'+esc(a.description||'')+'</span></td>'+
      '<td><span class="requester"><strong>'+esc(a.requested_by_name||'AMANAH USER')+'</strong><span>'+esc(a.requester_email||'')+'</span></span></td>'+
      '<td><span class="requester"><strong>'+esc(a.decided_by_name||'—')+'</strong></span></td>'+
      '<td>'+esc(formatDateTime(a.decided_at))+'</td>'+
      '<td><span class="history-status-chip '+decisionClass+'">'+esc(decision)+'</span></td>'+
      '<td><button class="mini review" type="button" data-history="'+esc(a.approval_id)+'">VIEW</button></td>'+
    '</tr>';
  }).join('');
  body.querySelectorAll('[data-history]').forEach(btn=>btn.addEventListener('click',()=>openHistory(btn.dataset.history)));
}

function openHistory(id){
  const record=approvalHistory.find(a=>a.approval_id===id);
  if(!record)return;
  currentHistoryRecord=record;
  document.getElementById('historyModalTitle').textContent=typeLabel(record.request_type)+' DECISION';
  document.getElementById('historyDetails').innerHTML=historyDetailHtml(record);
  const banner=document.getElementById('historyDecisionBanner');
  const status=record.status||'—';
  const cls=status==='APPROVED'?'approved':status==='REJECTED'?'rejected':'other';
  banner.className='history-decision-banner '+cls;
  banner.innerHTML='<div><span class="history-banner-dot"></span><strong>'+esc(status)+'</strong><small>Decision recorded by '+esc(record.decided_by_name||'General Manager')+' on '+esc(formatDateTime(record.decided_at))+'</small></div>';
  document.getElementById('historyModal').classList.remove('hidden');
  document.getElementById('historyModal').setAttribute('aria-hidden','false');
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
    document.getElementById('refreshHistory').addEventListener('click',loadHistory);
    document.getElementById('historyTypeFilter').addEventListener('change',loadHistory);
    document.getElementById('historyStatusFilter').addEventListener('change',loadHistory);
    document.getElementById('closeApprovalModal').addEventListener('click',closeModal);
    document.getElementById('cancelApproval').addEventListener('click',closeModal);
    document.getElementById('approveApproval').addEventListener('click',()=>decide('APPROVED'));
    document.getElementById('rejectApproval').addEventListener('click',()=>decide('REJECTED'));
    document.getElementById('approvalModal').addEventListener('click',e=>{if(e.target.id==='approvalModal')closeModal();});
    document.getElementById('closeHistoryModal').addEventListener('click',closeHistoryModal);
    document.getElementById('historyCloseButton').addEventListener('click',closeHistoryModal);
    document.getElementById('historyModal').addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistoryModal();});
    await Promise.all([loadApprovals(),loadHistory()]);
  }catch(error){console.error(error);showMsg(error.message||'Unable to load approval center.','error');}
});