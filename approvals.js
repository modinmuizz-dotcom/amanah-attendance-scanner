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
function closeDeleteHistoryModal(){
  document.getElementById('deleteHistoryModal').classList.add('hidden');
  document.getElementById('deleteHistoryModal').setAttribute('aria-hidden','true');
}
function openDeleteHistory(id){
  const record=approvalHistory.find(a=>a.approval_id===id);
  if(!record)return;
  currentHistoryRecord=record;
  document.getElementById('deleteHistoryRecord').innerHTML=
    '<strong>'+esc(typeLabel(record.request_type))+'</strong>'+
    '<span>'+esc(record.title||'Approval record')+'</span>'+
    '<small>Decision: '+esc(record.status||'—')+' • '+esc(formatDateTime(record.decided_at))+'</small>';
  document.getElementById('deleteHistoryModal').classList.remove('hidden');
  document.getElementById('deleteHistoryModal').setAttribute('aria-hidden','false');
}
async function deleteHistoryRecord(){
  if(!currentHistoryRecord)return;
  const btn=document.getElementById('confirmDeleteHistory');
  btn.disabled=true;
  btn.textContent='DELETING...';
  try{
    const {error}=await supabaseClient.rpc('amanah_delete_approval_history',{p_approval_id:currentHistoryRecord.approval_id});
    if(error)throw error;
    closeDeleteHistoryModal();
    currentHistoryRecord=null;
    showMsg('Approval history record deleted successfully. The original module record remains unchanged.','success');
    await loadHistory();
  }catch(error){
    console.error(error);
    showMsg(error.message||'Unable to delete approval history record.','error');
  }finally{
    btn.disabled=false;
    btn.textContent='DELETE RECORD';
  }
}
function typeLabel(type){
  return type==='PURCHASE_REQUEST'
    ? 'PURCHASING'
    : type==='MATERIAL_PICKUP'
      ? 'MATERIAL PICKUP'
      : type==='REPAIR_REQUEST'
        ? 'REPAIR REQUEST'
        : type==='MAINTENANCE'
          ? 'MAINTENANCE'
          : 'ACTIVITY CALENDAR';
}
function detailCard(label,value,opts={}){
  const full=opts.full?' detail-card-full':'';
  const accent=opts.accent?' detail-card-accent-'+opts.accent:'';
  return '<div class="detail-card'+full+accent+'"><div class="detail-label">'+esc(label)+'</div><div class="detail-value">'+esc(value==null||value===''?'—':value)+'</div></div>';
}
function stationLabel(value){
  if(value===null||value===undefined||value==='') return '—';
  const n=Number(value);
  if(!Number.isFinite(n)) return String(value);
  const km=Math.floor(Math.abs(n)/1000);
  const rem=Math.abs(n)-km*1000;
  return 'STA '+(n<0?'-':'')+km+'+'+rem.toFixed(3).padStart(7,'0');
}

function payloadCards(a, historical=false){
  const p=a.payload||{};
  const type=typeLabel(a.request_type);
  const isCancellation=p.request_action==='CANCEL';

  if(a.request_type==='ACTIVITY'){
    const equipment=String(p.equipment||'—').split(',').map(x=>x.trim()).filter(Boolean);
    return `
      <div class="review-summary">
        <div class="review-summary-main">
          <div class="review-summary-kicker">${isCancellation?'CANCELLATION REQUEST':'REQUEST TYPE'}</div>
          <h3>${isCancellation?'ACTIVITY CANCELLATION':'ACTIVITY CALENDAR'}</h3>
          <p>${isCancellation?'Cancellation request for an approved activity. General Manager approval is required before the activity is cancelled.':'Activity submitted for General Manager approval before scheduling.'}</p>
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
          ${isCancellation ? detailCard('REQUEST ACTION','CANCEL') : ''}
          ${detailCard('PROJECT',p.project_name)}
          ${detailCard('ACTIVITY TYPE',p.activity_type||p.activity||a.title)}
          ${(p.phase_id||p.section_id||p.work_component_id||p.station_start_m!=null||p.station_end_m!=null) ? detailCard('ROAD WORK LOCATION', [ [p.phase_code,p.phase_name].filter(Boolean).join(' — '), [p.section_code,p.section_name].filter(Boolean).join(' — '), p.work_component_name||p.work_component, (p.station_start_m!=null||p.station_end_m!=null) ? stationLabel(p.station_start_m)+' → '+stationLabel(p.station_end_m) : null ].filter(Boolean).join(' • '), {full:true,accent:'road'}) : ''}
          ${detailCard('ITEM / MATERIAL',p.activity_item||'—')}
          ${detailCard('QUANTITY',p.activity_quantity??'—')}
          ${detailCard('ACTIVITY DATE',p.activity_date)}
          ${detailCard('TIME',p.time)}
          ${(p.group_labor_in_charge && ['CONCRETE POURING','ROAD EMBANKMENT','BASE PREPARATION'].includes(String(p.activity_type||p.activity||'').toUpperCase())) ? detailCard("WHO'S GROUP LABOR IN-CHARGE?",p.group_labor_in_charge) : detailCard('MANPOWER',p.manpower??0)}
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
        <div class="review-summary-kicker">${isCancellation?'CANCELLATION REQUEST':'REQUEST TYPE'}</div>
        <h3>${esc(isCancellation ? (type+' CANCELLATION') : type)}</h3>
        <p>${esc(isCancellation ? 'Cancellation request for an approved record. General Manager approval is required before the record is cancelled.' : (a.title||'Request submitted for General Manager approval.'))}</p>
      </div>
      <div class="review-status ${historical ? 'review-status-'+String(a.status||'').toLowerCase() : ''}"><span></span><strong>${esc(historical ? (a.status||'DECISION RECORDED') : 'PENDING APPROVAL')}</strong><small>${esc(historical ? 'Decision recorded' : 'Awaiting decision')}</small></div>
    </div>`;

  if(a.request_type==='MATERIAL_PICKUP'){
    const materialLines=Array.isArray(p.materials)?p.materials:[];
    const materialsHtml=materialLines.length
      ? '<div class="detail-card detail-card-full"><div class="detail-label">MATERIALS SELECTED FOR PICKUP</div><div class="detail-value">'+
          materialLines.map(m =>
            '<div style="padding:9px 0;border-bottom:1px solid #e2e8f0">'+
              '<strong>'+esc(m.material_name||'Material')+'</strong>'+
              (m.specifications?' • '+esc(m.specifications):'')+
              '<div style="margin-top:3px;color:#64748b;font-size:11px">'+esc(m.quantity??'—')+' '+esc(m.unit||'')+'</div>'+
            '</div>'
          ).join('')+
        '</div></div>'
      : detailCard('MATERIAL',p.material_name||'—');
    return commonHeader+`
      <div class="review-section">
        <div class="review-section-title"><span>01</span><div><strong>MATERIAL PICKUP REQUEST</strong><small>Purchasing pickup request for GM approval</small></div></div>
        <div class="detail-grid detail-grid-3">
          ${detailCard('PICKUP REQUEST NO.',p.pickup_request_no||a.title)}
          ${detailCard('PURCHASE ORDER',p.purchase_order_no||'—')}
          ${detailCard('PURCHASE REQUEST',p.purchase_request_no||'—')}
          ${detailCard('PROJECT',p.project_name||'—')}
          ${materialsHtml}
          ${detailCard('SUPPLIER',p.supplier_name||'—')}
          ${detailCard('PICKUP LOCATION',p.pickup_location||'—',{full:true})}
          ${detailCard('DELIVER TO SITE',p.delivery_location||p.project_location||'—',{full:true})}
          ${detailCard('PICKUP UNIT',p.equipment_name||p.equipment_id||'—')}
          ${detailCard('PICKUP DATE',p.pickup_date||'—')}
          ${detailCard('SCHEDULED TIME',(p.scheduled_start||p.scheduled_end)?formatDateTime(p.scheduled_start)+' — '+formatDateTime(p.scheduled_end):'—')}
          ${detailCard('REMARKS',p.remarks||'—',{full:true})}
        </div>
      </div>
    `;
  }

  if(a.request_type==='PURCHASE_REQUEST'){
    return commonHeader+`
      <div class="review-section">
        <div class="review-section-title"><span>01</span><div><strong>REQUEST INFORMATION</strong><small>Purchase request summary</small></div></div>
        <div class="detail-grid detail-grid-3">
          ${isCancellation ? detailCard('REQUEST ACTION','CANCEL') : ''}
          ${detailCard('REQUEST NO.',p.request_no||a.title)}
          ${detailCard('REQUESTING SITE ENGINEER',p.requester_name||'—')}
          ${detailCard('ENCODED BY',a.requested_by_name||'—')}
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

  if(a.request_type==='REPAIR_REQUEST'){
    return commonHeader+`
      <div class="review-section">
        <div class="review-section-title"><span>01</span><div><strong>REPAIR REQUEST</strong><small>Maintenance request awaiting General Manager approval</small></div></div>
        <div class="detail-grid detail-grid-3">
          ${detailCard('REPAIR FORM NO.',p.repair_form_no||a.title)}
          ${detailCard('REQUEST DATE',p.request_date||'—')}
          ${detailCard('REQUESTED BY',a.requested_by_name||a.requester_email||'—')}
          ${detailCard('EQUIPMENT',p.equipment_name||p.equipment_id||'—')}
          ${detailCard('PROJECT',p.project_name||p.project_id||'—')}
          ${detailCard('PM INSPECTION REF.',p.pm_inspection_ref||'—')}
          ${detailCard('REPORTED BY',p.reported_by||'—')}
          ${detailCard('PHOTO EVIDENCE',String(p.photo_count??0)+' photo(s)')}
          ${detailCard('WORKS / MATERIALS',p.items_summary||'No work/material line items recorded yet.',{full:true})}
          ${detailCard('PROBLEMS ENCOUNTERED (SIRA)',p.problems_encountered||'—',{full:true})}
          ${detailCard('REMARKS',p.remarks||'—',{full:true})}
        </div>
      </div>
      <div class="review-section review-section-last">
        <div class="review-section-title"><span>02</span><div><strong>PHOTO EVIDENCE</strong><small>Review the attached Maintenance evidence before deciding.</small></div></div>
        <div id="repairApprovalPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
          <div style="grid-column:1/-1;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:800;text-align:center">Loading photo evidence…</div>
        </div>
      </div>
    `;  }

  return commonHeader+`
    <div class="review-section">
      <div class="review-section-title"><span>01</span><div><strong>MAINTENANCE REQUEST</strong><small>Equipment maintenance details</small></div></div>
      <div class="detail-grid detail-grid-3">
        ${isCancellation ? detailCard('REQUEST ACTION','CANCEL') : ''}
        ${detailCard('EQUIPMENT',p.equipment_name||p.equipment_id)}
        ${detailCard('MAINTENANCE TYPE',p.maintenance_type)}
        ${detailCard('DATE',p.maintenance_date)}
        ${detailCard('PROJECT',p.project_name)}
        ${detailCard('SUPPLIER / SHOP',p.supplier_shop)}
        ${detailCard('TOTAL AMOUNT',p.total_amount==null?'—':'₱'+Number(p.total_amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}))}
        ${detailCard('DESCRIPTION',p.description||a.description||'No additional description provided.',{full:true})}
      </div>
    </div>
    <div class="review-section review-section-last">
      <div class="review-section-title"><span>02</span><div><strong>PHOTO EVIDENCE</strong><small>Review the maintenance photos before making the General Manager decision.</small></div></div>
      <div id="maintenanceApprovalPhotoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
        <div style="grid-column:1/-1;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:800;text-align:center">Loading maintenance photo evidence…</div>
      </div>
    </div>`;
}

function historyDetailHtml(a){
  const p=a.payload||{};
  const base=payloadCards(a, true);
  const decision=a.status||'—';
  const decisionClass=decision.toLowerCase();
  const cancelled=decision==='CANCELLED';
  const actor=cancelled ? (a.cancelled_by_name||'—') : (a.decided_by_name||'—');
  const actionAt=cancelled ? a.cancelled_at : a.decided_at;
  const remarks=cancelled ? (a.cancellation_reason||'No cancellation reason was recorded.') : (a.decision_remarks||'No decision remarks were recorded.');
  const sectionTitle=cancelled?'CANCELLATION RECORD':'DECISION RECORD';
  const actorLabel=cancelled?'CANCELLED BY':'DECIDED BY';
  const dateLabel=cancelled?'CANCELLED DATE':'DECISION DATE';
  const remarksLabel=cancelled?'CANCELLATION REASON':'REVIEW REMARKS';
  const helpText=cancelled?'Request withdrawn by the original requester before General Manager decision.':'Final approval action recorded by the system';
  return base+`
    <div class="review-section review-section-last">
      <div class="review-section-title"><span>04</span><div><strong>${sectionTitle}</strong><small>${helpText}</small></div></div>
      <div class="history-decision-grid">
        <div class="history-decision-card ${esc(decisionClass)}"><div class="detail-label">STATUS</div><div class="detail-value">${esc(decision)}</div></div>
        <div class="history-decision-card"><div class="detail-label">${actorLabel}</div><div class="detail-value">${esc(actor)}</div></div>
        <div class="history-decision-card"><div class="detail-label">${dateLabel}</div><div class="detail-value">${esc(formatDateTime(actionAt))}</div></div>
        <div class="history-decision-card history-decision-full"><div class="detail-label">${remarksLabel}</div><div class="detail-value">${esc(remarks)}</div></div>
      </div>
    </div>`;
}

async function requireAccess(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='admin.html';return false;}
  await supabaseClient.rpc('amanah_register_current_user');

  const [{data:role,error:roleError},{data:permissionRows,error:permissionError}]=await Promise.all([
    supabaseClient.rpc('amanah_get_current_role'),
    supabaseClient.rpc('amanah_get_current_permissions')
  ]);

  if(roleError)throw roleError;
  if(permissionError)throw permissionError;

  const perms=new Set((permissionRows||[]).map(x=>x.permission_key));
  const allowedRoles=new Set(['GENERAL MANAGER','ADMINISTRATOR','SUPER ADMIN']);
  const normalizedRole=String(role||'UNASSIGNED').toUpperCase();

  if(!perms.has('approvals.view') || !allowedRoles.has(normalizedRole)){
    document.querySelector('.approvals-page').innerHTML=
      '<section class="approval-panel" style="padding:45px;text-align:center">'+
      '<div class="approval-kicker">ACCESS CONTROL</div>'+
      '<h2>APPROVAL CENTER</h2>'+
      '<p style="color:#64748b">The Approval Center is restricted to the General Manager and authorized system administrators.</p>'+
      '<button class="button primary" type="button" onclick="location.href=\'dashboard.html\'">RETURN TO DASHBOARD</button>'+
      '</section>';
    return false;
  }

  document.querySelector('.gm-badge strong').textContent=
    normalizedRole==='GENERAL MANAGER'?'GENERAL MANAGER':'AUTHORIZED ADMINISTRATOR';

  return true;
}

async function loadLumpSumApprovals(){
  const body=document.getElementById('lumpApprovalBody');
  if(!body)return;
  try{
    const [billings,contracts]=await Promise.all([
      supabaseClient.from('amanah_lump_billings')
        .select('id,contract_id,milestone,gross_amount,status,submitted_at')
        .in('status',['SUBMITTED','VERIFIED']).order('submitted_at',{ascending:false}),
      supabaseClient.from('amanah_lump_contracts')
        .select('id,project_id,scope_title,contractor_name')
    ]);
    if(billings.error)throw billings.error;
    if(contracts.error)throw contracts.error;
    const byId=new Map((contracts.data||[]).map(c=>[c.id,c]));
    const rows=billings.data||[];
    if(!rows.length){
      body.innerHTML='<tr><td colspan="5" class="empty">No pending lump-sum billings.</td></tr>';
      return;
    }
    body.innerHTML=rows.map(b=>{
      const c=byId.get(b.contract_id)||{};
      const url='lump-sum.html?billing='+encodeURIComponent(b.id);
      return '<tr>'+
        '<td><strong>'+esc(c.scope_title||'Lump-sum contract')+'</strong><span class="request-sub">'+esc(c.project_id||'')+' • '+esc(c.contractor_name||'')+'</span></td>'+
        '<td>'+esc(b.milestone)+'</td>'+
        '<td><strong>₱'+Number(b.gross_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})+'</strong></td>'+
        '<td><span class="pending-chip">'+esc(b.status)+'</span></td>'+
        '<td><a class="mini review" href="'+url+'" style="text-decoration:none;display:inline-block">'+
        (b.status==='VERIFIED'?'GM REVIEW':'AWAIT ENGINEER')+'</a></td>'+
        '</tr>';
    }).join('');
  }catch(error){
    console.error(error);
    body.innerHTML='<tr><td colspan="5" class="empty">Unable to load lump-sum claims. Check access and refresh.</td></tr>';
  }
}

async function loadApprovals(){
  const type=document.getElementById('typeFilter').value;
  let q=supabaseClient.from('amanah_approval_requests').select('*').eq('status','PENDING').order('submitted_at',{ascending:false});
  if(type==='MAINTENANCE') q=q.in('request_type',['MAINTENANCE','REPAIR_REQUEST']);
  else if(type) q=q.eq('request_type',type);
  const {data,error}=await q;
  if(error)throw error;
  approvals=data||[];
  render();
}
async function loadHistory(){
  const type=document.getElementById('historyTypeFilter').value;
  const status=document.getElementById('historyStatusFilter').value;
  let q=supabaseClient.from('amanah_approval_requests').select('*').neq('status','PENDING').order('decided_at',{ascending:false}).order('submitted_at',{ascending:false}).limit(200);
  if(type==='MAINTENANCE') q=q.in('request_type',['MAINTENANCE','REPAIR_REQUEST']);
  else if(type) q=q.eq('request_type',type);
  if(status)q=q.eq('status',status);
  const {data,error}=await q;
  if(error)throw error;
  approvalHistory=data||[];
  renderHistory();
}
function render(){
  const counts={ACTIVITY:0,PURCHASE_REQUEST:0,MATERIAL_PICKUP:0,REPAIR_REQUEST:0,MAINTENANCE:0};
  approvals.forEach(a=>counts[a.request_type]=(counts[a.request_type]||0)+1);
  document.getElementById('pendingCount').textContent=approvals.length;
  document.getElementById('activityCount').textContent=counts.ACTIVITY||0;
  document.getElementById('purchaseCount').textContent=counts.PURCHASE_REQUEST||0;
  document.getElementById('maintenanceCount').textContent=(counts.MAINTENANCE||0)+(counts.REPAIR_REQUEST||0);
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
      '<td><div class="action-group"><button class="mini review" type="button" data-history="'+esc(a.approval_id)+'">VIEW</button><button class="mini print" type="button" data-print-history="'+esc(a.approval_id)+'">PRINT</button><button class="mini delete-history" type="button" data-delete-history="'+esc(a.approval_id)+'">DELETE</button></div></td>'+
    '</tr>';
  }).join('');
  body.querySelectorAll('[data-history]').forEach(btn=>btn.addEventListener('click',()=>openHistory(btn.dataset.history)));
  body.querySelectorAll('[data-print-history]').forEach(btn=>btn.addEventListener('click',()=>printApprovalRecordById(btn.dataset.printHistory)));
  body.querySelectorAll('[data-delete-history]').forEach(btn=>btn.addEventListener('click',()=>openDeleteHistory(btn.dataset.deleteHistory)));
}

function approvalPrintStyles(){
  return `
    @page{size:A4 portrait;margin:14mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#172033;font-family:Arial,Helvetica,sans-serif}
    body{font-size:12px;line-height:1.45}
    .print-wrap{max-width:780px;margin:0 auto}
    .print-header{border-bottom:3px solid #173f91;padding-bottom:12px;margin-bottom:16px}
    .print-brand{font-size:18px;font-weight:900;letter-spacing:.04em;color:#173f91}
    .print-sub{margin-top:3px;color:#64748b;font-size:10px;font-weight:700}
    .print-title{margin-top:12px;font-size:22px;font-weight:900;text-transform:uppercase}
    .print-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
    .meta-box,.print-card{border:1px solid #d9e0ea;border-radius:8px;padding:9px}
    .meta-label,.print-label{font-size:8px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
    .meta-value,.print-value{margin-top:3px;font-weight:800;color:#172033}
    .print-section{margin-top:14px;break-inside:avoid}
    .print-section h3{margin:0 0 7px;font-size:11px;text-transform:uppercase;color:#173f91;letter-spacing:.04em}
    .print-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .print-full{grid-column:1/-1}
    .print-status{display:inline-block;padding:5px 9px;border-radius:999px;font-weight:900;border:1px solid #cbd5e1}
    .print-status.approved{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
    .print-status.rejected{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
    .print-status.cancelled{background:#f8fafc;color:#475569}
    .print-photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .print-photo{border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;break-inside:avoid}
    .print-photo img{display:block;width:100%;height:230px;object-fit:cover}
    .print-photo-cap{padding:7px;font-size:9px;font-weight:900;color:#475569}
    .print-footer{margin-top:20px;padding-top:8px;border-top:1px solid #d9e0ea;color:#64748b;font-size:9px}
  `;
}
function printPayloadDetails(record,p){
  const rows=[];
  const add=(label,value,full=false)=>rows.push(`<div class="print-card ${full?'print-full':''}"><div class="print-label">${esc(label)}</div><div class="print-value">${esc(value==null||value===''?'—':value)}</div></div>`);
  if(record.request_type==='REPAIR_REQUEST'){
    add('Repair Form No.',p.repair_form_no||record.title);
    add('Request Date',p.request_date);
    add('Equipment',p.equipment_name||p.equipment_id);
    add('Project',p.project_name||p.project_id);
    add('PM Inspection Ref.',p.pm_inspection_ref);
    add('Reported By',p.reported_by);
    add('Photo Evidence',String(p.photo_count??0)+' photo(s)');
    add('Works / Materials',p.items_summary,true);
    add('Problems Encountered (SIRA)',p.problems_encountered,true);
    add('Remarks',p.remarks,true);
  }else{
    add('Request Description',record.description,true);
    Object.entries(p).slice(0,14).forEach(([key,value])=>{
      if(value===null||value===undefined||typeof value==='object')return;
      add(key.replaceAll('_',' ').toUpperCase(),value);
    });
  }
  return rows.join('');
}
function buildDecisionPrintHtml(record,photos=[]){
  const p=record.payload||{};
  const status=String(record.status||'—').toUpperCase();
  const cls=status==='APPROVED'?'approved':status==='REJECTED'?'rejected':status==='CANCELLED'?'cancelled':'';
  return `
    <div class="print-wrap">
      <div class="print-header">
        <div class="print-brand">AMANAH CONSTRUCTION SERVICES</div>
        <div class="print-sub">MANAGEMENT APPROVAL CENTER</div>
        <div class="print-title">DECISION RECORD</div>
        <div class="print-meta">
          <div class="meta-box"><div class="meta-label">Request Type</div><div class="meta-value">${esc(typeLabel(record.request_type))}</div></div>
          <div class="meta-box"><div class="meta-label">Request</div><div class="meta-value">${esc(record.title||'—')}</div></div>
          <div class="meta-box"><div class="meta-label">Decision</div><div class="meta-value"><span class="print-status ${cls}">${esc(status)}</span></div></div>
          <div class="meta-box"><div class="meta-label">Requested By</div><div class="meta-value">${esc(record.requested_by_name||record.requester_email||'—')}</div></div>
          <div class="meta-box"><div class="meta-label">Submitted</div><div class="meta-value">${esc(formatDateTime(record.submitted_at))}</div></div>
          <div class="meta-box"><div class="meta-label">Decided By</div><div class="meta-value">${esc(record.decided_by_name||'—')}</div></div>
          <div class="meta-box"><div class="meta-label">Decision Date</div><div class="meta-value">${esc(formatDateTime(record.decided_at||record.cancelled_at))}</div></div>
          <div class="meta-box print-full"><div class="meta-label">Decision Remarks</div><div class="meta-value">${esc(record.decision_remarks||record.cancellation_reason||'No decision remarks recorded.')}</div></div>
        </div>
      </div>
      <div class="print-section">
        <h3>Request Details</h3>
        <div class="print-grid">${printPayloadDetails(record,p)}</div>
      </div>
      ${photos.length?`
      <div class="print-section">
        <h3>Photo Evidence</h3>
        <div class="print-photos">${photos.map(photo=>`
          <div class="print-photo">
            <img src="${esc(photo.url)}" alt="Repair evidence">
            <div class="print-photo-cap">${esc(photo.category||'OTHER')}</div>
          </div>`).join('')}</div>
      </div>`:''}
      <div class="print-footer">Printed from AMANAH Approval Center • Generated ${esc(formatDateTime(new Date().toISOString()))}</div>
    </div>`;
}
async function printApprovalRecordById(id){
  const record=approvalHistory.find(a=>String(a.approval_id)===String(id));
  if(record)await printApprovalRecord(record);
}
async function printApprovalRecord(record){
  const win=window.AmanahDirectPrint.create('APPROVAL DECISION RECORD');
  win.document.open();
  win.document.write('<!doctype html><html><head><title>AMANAH Decision Record</title><style>'+approvalPrintStyles()+'</style></head><body><div id="printRoot"><div class="print-wrap" style="padding:30px;text-align:center;color:#64748b;font-weight:800">Preparing print record…</div></div></body></html>');
  win.document.close();

  let photos=[];
  if(record.request_type==='REPAIR_REQUEST'){
    try{
      const {data,error}=await supabaseClient.from('repair_request_photos').select('file_path,photo_category').eq('repair_request_id',record.entity_id).order('uploaded_at',{ascending:false});
      if(!error&&data?.length){
        const signed=await Promise.all(data.map(async photo=>{
      try{
        const result=await Promise.race([
          supabaseClient.storage.from('repair-evidence').createSignedUrl(photo.file_path,600),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('PHOTO URL TIMEOUT')),8000))
        ]);
        return result;
      }catch(error){
        console.error('Repair photo signed URL failed:',photo.file_path,error);
        return {data:null,error};
      }
    }));
        photos=data.map((photo,i)=>({url:signed[i]?.data?.signedUrl||'',category:photo.photo_category})).filter(x=>x.url);
      }
    }catch(error){console.warn('Print photo load warning:',error);}
  }

  const root=win.document.getElementById('printRoot');
  if(root)root.innerHTML=buildDecisionPrintHtml(record,photos);
  window.AmanahDirectPrint.finish(win);
}
function openHistory(id){
  const record=approvalHistory.find(a=>a.approval_id===id);
  if(!record)return;
  currentHistoryRecord=record;
  document.getElementById('historyModalTitle').textContent=typeLabel(record.request_type)+' DECISION';
  document.getElementById('historyDetails').innerHTML=historyDetailHtml(record);
  const banner=document.getElementById('historyDecisionBanner');
  const status=record.status||'—';
  const cls=status==='APPROVED'?'approved':status==='REJECTED'?'rejected':status==='CANCELLED'?'cancelled':'other';
  banner.className='history-decision-banner '+cls;
  const bannerActor=record.status==='CANCELLED'?(record.cancelled_by_name||'Requester'):(record.decided_by_name||'General Manager');
  const bannerDate=record.status==='CANCELLED'?record.cancelled_at:record.decided_at;
  const bannerText=record.status==='CANCELLED'?'Request cancelled by '+bannerActor+' on '+formatDateTime(bannerDate):'Decision recorded by '+bannerActor+' on '+formatDateTime(bannerDate);
  banner.innerHTML='<div><span class="history-banner-dot"></span><strong>'+esc(status)+'</strong><small>'+esc(bannerText)+'</small></div>';
  document.getElementById('historyModal').classList.remove('hidden');
  document.getElementById('historyModal').setAttribute('aria-hidden','false');
  if(record.request_type==='REPAIR_REQUEST') loadRepairApprovalPhotos(record,true);
  if(record.request_type==='MAINTENANCE') loadMaintenanceApprovalPhotos(record,true);
}

async function loadMaintenanceApprovalPhotos(approval,isHistory=false){
  if(!approval || approval.request_type!=='MAINTENANCE')return;
  const scope=isHistory?'#historyModal':'#approvalModal';
  const grid=document.querySelector(scope+' #maintenanceApprovalPhotoGrid');
  if(!grid)return;

  try{
    const {data,error}=await supabaseClient
      .from('equipment_maintenance_photos')
      .select('photo_id,storage_path,caption,created_at')
      .eq('maintenance_id',approval.entity_id)
      .order('created_at',{ascending:false});
    if(error)throw error;

    if(!data?.length){
      grid.innerHTML='<div style="grid-column:1/-1;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:800;text-align:center">No maintenance photo evidence attached.</div>';
      return;
    }

    const signed=await Promise.all(
      data.map(async photo=>{
        try{
          const result=await Promise.race([
            supabaseClient.storage.from('equipment-maintenance-evidence').createSignedUrl(photo.storage_path,600),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('PHOTO URL TIMEOUT')),8000))
          ]);
          return result;
        }catch(error){
          console.error('Maintenance photo signed URL failed:',photo.storage_path,error);
          return {data:null,error};
        }
      })
    );

    grid.innerHTML=data.map((photo,index)=>{
      const src=signed[index]?.data?.signedUrl||'';
      return '<div style="border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff">'+
        '<div style="height:190px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">'+
          (src
            ? '<img src="'+esc(src)+'" alt="Maintenance photo evidence" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in" data-maintenance-approval-photo="'+esc(src)+'">'
            : '<div style="color:#94a3b8;font-size:11px;font-weight:800">PHOTO UNAVAILABLE</div>')+
        '</div>'+
        '<div style="padding:9px">'+
          '<div style="font-size:10px;font-weight:900;color:#1e293b">MAINTENANCE EVIDENCE</div>'+
          (photo.caption?'<div style="margin-top:4px;color:#64748b;font-size:10px">'+esc(photo.caption)+'</div>':'')+
        '</div>'+
      '</div>';
    }).join('');

    grid.querySelectorAll('[data-maintenance-approval-photo]').forEach(img=>{
      img.addEventListener('click',()=>{
        const src=img.getAttribute('data-maintenance-approval-photo');
        const win=window.open('','_blank');
        if(win){
          win.document.write('<title>Maintenance Photo Evidence</title><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+src+'" style="max-width:96vw;max-height:96vh;object-fit:contain"></body>');
          win.document.close();
        }
      });
    });
  }catch(error){
    console.error('Unable to load maintenance approval photos:',error);
    grid.innerHTML='<div style="grid-column:1/-1;padding:18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:11px;font-weight:800">Unable to load maintenance photo evidence.</div>';
  }
}

async function loadRepairApprovalPhotos(approval,isHistory=false){
  if(!approval || approval.request_type!=='REPAIR_REQUEST')return;
  const scope=isHistory?'#historyModal':'#approvalModal';
  const grid=document.querySelector(scope+' #repairApprovalPhotoGrid');
  if(!grid)return;
  try{
    const {data,error}=await supabaseClient
      .from('repair_request_photos')
      .select('photo_id,file_path,photo_category,caption,uploaded_at')
      .eq('repair_request_id',approval.entity_id)
      .order('uploaded_at',{ascending:false});
    if(error)throw error;
    if(!data?.length){
      grid.innerHTML='<div style="grid-column:1/-1;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:800;text-align:center">No photo evidence attached.</div>';
      return;
    }
    const signed=await Promise.all(data.map(photo=>supabaseClient.storage.from('repair-evidence').createSignedUrl(photo.file_path,600)));
    grid.innerHTML=data.map((photo,index)=>{
      const src=signed[index]?.data?.signedUrl||'';
      return '<div style="border:1px solid #dbe2ea;border-radius:12px;overflow:hidden;background:#fff">'+
        '<div style="height:190px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden">'+
          (src?'<img src="'+esc(src)+'" alt="Repair photo evidence" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in" data-approval-photo="'+esc(src)+'">':'<div style="color:#94a3b8;font-size:11px;font-weight:800">PHOTO UNAVAILABLE</div>')+
        '</div>'+
        '<div style="padding:9px"><div style="font-size:10px;font-weight:900;color:#1e293b">'+esc(photo.photo_category||'OTHER')+'</div>'+
        (photo.caption?'<div style="margin-top:4px;color:#64748b;font-size:10px">'+esc(photo.caption)+'</div>':'')+
        '</div></div>';
    }).join('');
    grid.querySelectorAll('[data-approval-photo]').forEach(img=>{
      img.addEventListener('click',()=>{
        const src=img.getAttribute('data-approval-photo');
        const win=window.open();
        if(win)win.document.write('<body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+src+'" style="max-width:96vw;max-height:96vh;object-fit:contain"></body>');
      });
    });
  }catch(error){
    console.error(error);
    grid.innerHTML='<div style="grid-column:1/-1;padding:18px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:11px;font-weight:800">Unable to load photo evidence.</div>';
  }
}

function openReview(id){
  const approval=approvals.find(a=>a.approval_id===id);if(!approval)return;
  currentApproval=approval;
  document.getElementById('modalTitle').textContent=typeLabel(approval.request_type)+' REVIEW';
  document.getElementById('approvalDetails').innerHTML=payloadCards(approval);
  document.getElementById('decisionRemarks').value='';
  document.getElementById('approvalModal').classList.remove('hidden');
  document.getElementById('approvalModal').setAttribute('aria-hidden','false');
  if(approval.request_type==='REPAIR_REQUEST') loadRepairApprovalPhotos(approval,false);
  if(approval.request_type==='MAINTENANCE') loadMaintenanceApprovalPhotos(approval,false);
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
    document.getElementById('refreshLumpApprovals').addEventListener('click',loadLumpSumApprovals);
    document.getElementById('typeFilter').addEventListener('change',loadApprovals);
    document.getElementById('refreshHistory').addEventListener('click',loadHistory);
    document.getElementById('historyTypeFilter').addEventListener('change',loadHistory);
    document.getElementById('historyStatusFilter').addEventListener('change',loadHistory);
    document.getElementById('closeApprovalModal').addEventListener('click',closeModal);
    document.getElementById('cancelApproval').addEventListener('click',closeModal);
    document.getElementById('printPendingApproval').addEventListener('click',()=>{
      if(currentApproval)printApprovalRecord({...currentApproval,status:'PENDING APPROVAL',decided_by_name:'—',decided_at:null,decision_remarks:'Pending General Manager decision.'});
    });
    document.getElementById('approveApproval').addEventListener('click',()=>decide('APPROVED'));
    document.getElementById('rejectApproval').addEventListener('click',()=>decide('REJECTED'));
    document.getElementById('approvalModal').addEventListener('click',e=>{if(e.target.id==='approvalModal')closeModal();});
    document.getElementById('closeHistoryModal').addEventListener('click',closeHistoryModal);
    document.getElementById('historyPrintButton').addEventListener('click',()=>{if(currentHistoryRecord)printApprovalRecord(currentHistoryRecord);});
    document.getElementById('historyCloseButton').addEventListener('click',closeHistoryModal);
    document.getElementById('historyModal').addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistoryModal();});
    document.getElementById('closeDeleteHistoryModal').addEventListener('click',closeDeleteHistoryModal);
    document.getElementById('cancelDeleteHistory').addEventListener('click',closeDeleteHistoryModal);
    document.getElementById('confirmDeleteHistory').addEventListener('click',deleteHistoryRecord);
    document.getElementById('deleteHistoryModal').addEventListener('click',e=>{if(e.target.id==='deleteHistoryModal')closeDeleteHistoryModal();});
    await Promise.all([loadApprovals(),loadHistory(),loadLumpSumApprovals()]);
  }catch(error){console.error(error);showMsg(error.message||'Unable to load approval center.','error');}
});