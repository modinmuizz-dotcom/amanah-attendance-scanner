const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';

const supabaseClient=window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let allActivityRecords=[];
let projectLocations=new Map();

function escapeHtml(value){
  if(value===null||value===undefined)return '';
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function showMessage(message,type='error'){
  const el=document.getElementById('activityMessage');
  el.textContent=message;
  el.className=`message ${type}`;
}

function clearMessage(){
  const el=document.getElementById('activityMessage');
  el.textContent='';
  el.className='message hidden';
}

function formatDate(value){
  if(!value)return '—';
  const text=String(value).slice(0,10);
  const p=text.split('-');
  return p.length===3 ? `${p[1]}/${p[2]}/${p[0]}` : text;
}

function formatTime(value){
  if(!value)return '—';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleTimeString([],{
    hour:'numeric',
    minute:'2-digit'
  });
}

function numberValue(value){
  const n=Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString('en-PH',{maximumFractionDigits:6})
    : '0';
}

async function requireSession(){
  const {data,error}=await supabaseClient.auth.getSession();
  if(error)throw error;
  if(!data?.session){
    location.href='admin.html';
    return false;
  }
  return true;
}

async function loadActivitySiteData(){
  clearMessage();

  if(!(await requireSession()))return;

  try{
    const [
      attendanceResult,
      activityResult,
      extraEvidenceResult,
      projectResult
    ]=await Promise.all([
      supabaseClient
        .from('attendance')
        .select('attendance_id,employee_id,employee_name,equipment_id,equipment_name,project_id,project_name,attendance_date,time_out,status'),
      supabaseClient
        .from('attendance_activities')
        .select('id,attendance_id,activity_category,activity_description,quantity,photo_1_path,photo_2_path,created_at')
        .order('created_at',{ascending:false}),
      supabaseClient
        .from('activity_evidence_photos')
        .select('evidence_id,attendance_id,project_activity_id,photo_path,created_at')
        .order('created_at',{ascending:false}),
      supabaseClient
        .from('projects')
        .select('project_id,project_name,location')
    ]);

    if(attendanceResult.error)throw attendanceResult.error;
    if(activityResult.error)throw activityResult.error;
    if(extraEvidenceResult.error)throw extraEvidenceResult.error;
    if(projectResult.error)throw projectResult.error;

    projectLocations=new Map(
      (projectResult.data||[]).map(p=>[
        String(p.project_id),
        p.location || ''
      ])
    );

    const attendanceById=new Map(
      (attendanceResult.data||[])
        .filter(row=>row.time_out || String(row.status||'').toUpperCase()==='COMPLETED')
        .map(row=>[String(row.attendance_id),row])
    );

    const extraByAttendance=new Map();
    (extraEvidenceResult.data||[]).forEach(photo=>{
      const key=String(photo.attendance_id);
      if(!extraByAttendance.has(key))extraByAttendance.set(key,[]);
      extraByAttendance.get(key).push(photo.photo_path);
    });

    allActivityRecords=(activityResult.data||[])
      .map(activity=>{
        const attendance=attendanceById.get(String(activity.attendance_id));
        if(!attendance)return null;

        const location=
          projectLocations.get(String(attendance.project_id||'')) ||
          (attendance.project_name ? 'CUSTOM / PROJECT LOCATION' : '—');

        return {
          ...activity,
          attendance,
          location,
          extra_photo_paths:extraByAttendance.get(String(activity.attendance_id))||[]
        };
      })
      .filter(Boolean);

    populateActivityCategories();
    renderActivitySite();
  }catch(error){
    console.error(error);
    showMessage(
      error.message || 'Unable to load Activities on Site.',
      'error'
    );
    document.getElementById('activitySiteBody').innerHTML=
      '<tr><td colspan="10" class="activity-empty">Unable to load activity records.</td></tr>';
  }
}

const STANDARD_ACTIVITY_TYPES = [
  'HAULING',
  'DELIVER',
  'TRIP',
  'LOADS',
  'CLEARING',
  'SLOPE',
  'CLEARING AND HAULING',
  'ROAD REPAIR',
  'BATCHING'
];

function populateActivityCategories(){
  const select=document.getElementById('activityCategory');
  const current=select.value;

  const recordedValues=
    allActivityRecords
      .map(r=>String(r.activity_category || '').trim())
      .filter(Boolean);

  const values=[...new Set([
    ...STANDARD_ACTIVITY_TYPES,
    ...recordedValues
  ])].sort((a,b)=>a.localeCompare(b));

  select.innerHTML=
    '<option value="">ALL ACTIVITIES</option>'+
    values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

  select.value=current;
}

function getFilteredRecords(){
  const search=document.getElementById('activitySearch').value.trim().toLowerCase();
  const date=document.getElementById('activityDate').value;
  const category=document.getElementById('activityCategory').value;

  return allActivityRecords.filter(record=>{
    const attendance=record.attendance;
    const haystack=[
      attendance.employee_name,
      attendance.employee_id,
      attendance.equipment_name,
      attendance.equipment_id,
      attendance.project_name,
      attendance.project_id,
      record.location,
      record.activity_category,
      record.activity_description
    ].join(' ').toLowerCase();

    const matchesSearch=!search || haystack.includes(search);
    const matchesDate=!date || String(attendance.attendance_date||'').slice(0,10)===date;
    const matchesCategory=!category || record.activity_category===category;

    return matchesSearch && matchesDate && matchesCategory;
  });
}

function renderActivitySite(){
  const records=getFilteredRecords();
  const body=document.getElementById('activitySiteBody');

  const uniqueAttendance=new Set(
    records.map(r=>String(r.attendance.attendance_id))
  );

  const photos=records.reduce(
    (count,r)=>count+(r.photo_1_path?1:0)+(r.photo_2_path?1:0)+(r.extra_photo_paths?.length||0),
    0
  );

  document.getElementById('activityCount').textContent=
    records.length.toLocaleString('en-PH');
  document.getElementById('attendanceCount').textContent=
    uniqueAttendance.size.toLocaleString('en-PH');
  document.getElementById('photoCount').textContent=
    photos.toLocaleString('en-PH');
  document.getElementById('dateShown').textContent=
    document.getElementById('activityDate').value
      ? formatDate(document.getElementById('activityDate').value)
      : 'ALL';

  if(!records.length){
    body.innerHTML=
      '<tr><td colspan="10" class="activity-empty">No site activity records found.</td></tr>';
    return;
  }

  body.innerHTML=records.map((record,index)=>{
    const a=record.attendance;
    const photoCount=(record.photo_1_path?1:0)+(record.photo_2_path?1:0)+(record.extra_photo_paths?.length||0);

    return `
      <tr>
        <td>${escapeHtml(formatDate(a.attendance_date))}</td>
        <td>
          <strong>${escapeHtml(a.employee_name||'—')}</strong>
          <small>${escapeHtml(a.employee_id||'')}</small>
        </td>
        <td>
          <strong>${escapeHtml(a.equipment_name||'—')}</strong>
          <small>${escapeHtml(a.equipment_id||'')}</small>
        </td>
        <td>
          <strong>${escapeHtml(a.project_name||'—')}</strong>
          <small>${escapeHtml(a.project_id||'')}</small>
        </td>
        <td>${escapeHtml(record.location||'—')}</td>
        <td><strong>${escapeHtml(record.activity_category||'—')}</strong></td>
        <td>${escapeHtml(record.activity_description||'—')}</td>
        <td class="activity-qty">${escapeHtml(numberValue(record.quantity))}</td>
        <td>${escapeHtml(formatTime(a.time_out))}</td>
        <td>
          ${
            photoCount
              ? `<button class="activity-evidence-button" type="button" data-evidence-index="${index}">VIEW ${photoCount} PHOTO${photoCount===1?'':'S'}</button>`
              : '<span class="activity-no-evidence">NO PHOTO</span>'
          }
        </td>
      </tr>
    `;
  }).join('');

  body.querySelectorAll('[data-evidence-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      const record=records[Number(button.dataset.evidenceIndex)];
      openEvidence(record);
    });
  });
}

async function openEvidence(record){
  const modal=document.getElementById('activityEvidenceModal');
  const content=document.getElementById('evidenceContent');
  const title=document.getElementById('evidenceTitle');
  const subtitle=document.getElementById('evidenceSubtitle');

  title.textContent=
    `${record.activity_category || 'Site Activity'} — Photo Evidence`;
  subtitle.textContent=
    `${record.attendance.employee_name || 'Employee'} • ${formatDate(record.attendance.attendance_date)} • ${formatTime(record.attendance.time_out)}`;

  content.innerHTML=
    '<div class="activity-photo-card"><div class="activity-photo-missing">Loading photo evidence...</div></div>';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');

  const paths=[
    record.photo_1_path,
    record.photo_2_path,
    ...(record.extra_photo_paths||[])
  ].filter(Boolean);

  if(!paths.length){
    content.innerHTML=
      '<div class="activity-photo-card"><div class="activity-photo-missing">No photo evidence is attached to this activity.</div></div>';
    return;
  }

  try{
    const signedResults=await Promise.all(
      paths.map(path=>
        supabaseClient
          .storage
          .from('attendance-activity-evidence')
          .createSignedUrl(path,3600)
      )
    );

    content.innerHTML=signedResults.map((result,index)=>{
      if(result.error || !result.data?.signedUrl){
        return `
          <div class="activity-photo-card">
            <div class="activity-photo-missing">Photo ${index+1} could not be opened.</div>
          </div>
        `;
      }

      return `
        <a class="activity-photo-card" href="${escapeHtml(result.data.signedUrl)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(result.data.signedUrl)}" alt="Activity evidence ${index+1}">
          <div class="activity-photo-label">PHOTO ${index+1} • OPEN FULL SIZE</div>
        </a>
      `;
    }).join('');
  }catch(error){
    content.innerHTML=
      `<div class="activity-photo-card"><div class="activity-photo-missing">${escapeHtml(error.message||'Unable to load photo evidence.')}</div></div>`;
  }
}

function closeEvidence(){
  const modal=document.getElementById('activityEvidenceModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  document.getElementById('evidenceContent').innerHTML='';
}

function clearFilters(){
  document.getElementById('activitySearch').value='';
  document.getElementById('activityDate').value='';
  document.getElementById('activityCategory').value='';
  renderActivitySite();
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('refreshActivitiesButton').addEventListener('click',loadActivitySiteData);
  document.getElementById('clearActivityFilters').addEventListener('click',clearFilters);
  document.getElementById('activitySearch').addEventListener('input',renderActivitySite);
  document.getElementById('activityDate').addEventListener('change',renderActivitySite);
  document.getElementById('activityCategory').addEventListener('change',renderActivitySite);
  document.getElementById('closeEvidenceButton').addEventListener('click',closeEvidence);
  document.getElementById('closeEvidenceButtonBottom').addEventListener('click',closeEvidence);
  document.getElementById('activityEvidenceModal').addEventListener('click',event=>{
    if(event.target.id==='activityEvidenceModal')closeEvidence();
  });

  loadActivitySiteData();
});