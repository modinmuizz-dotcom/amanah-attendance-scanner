const SUPABASE_URL = 'https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  project: null,
  phases: [],
  sections: [],
  components: [],
  selectedPhaseId: null,
  selectedSectionId: null,
  modal: { type: null, mode: 'add', record: null }
};

const qs = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const projectId = params.get('project_id');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function showNotice(message, type='ok') {
  const el = qs('notice');
  el.textContent = message;
  el.className = 'notice ' + type;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { el.className = 'notice'; }, 4500);
}

function stationLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const meters = Number(value);
  if (!Number.isFinite(meters)) return escapeHtml(value);
  const sign = meters < 0 ? '-' : '';
  const abs = Math.abs(meters);
  const km = Math.floor(abs / 1000);
  const rem = abs - km * 1000;
  return 'STA ' + sign + km.toString().padStart(1,'0') + '+' + rem.toFixed(3).padStart(7,'0');
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNum(value) {
  const n = num(value);
  return n === null ? '—' : n.toLocaleString('en-PH', {maximumFractionDigits:3});
}

function phaseLabel(phase) {
  return phase.phase_code ? phase.phase_code + ' — ' + phase.phase_name : phase.phase_name;
}

function sectionLabel(section) {
  return section.section_code ? section.section_code + ' — ' + section.section_name : section.section_name;
}

function statusPill(status) {
  const cls = status === 'DONE' ? 'green' : status === 'IN PROGRESS' ? 'orange' : status === 'CANCELLED' ? 'red' : 'blue';
  return '<span class="pill '+cls+'">'+escapeHtml(status || 'PLANNED')+'</span>';
}

function typeSideLabel(component) {
  return [component.component_type, component.component_side !== 'NONE' ? component.component_side : ''].filter(Boolean).join(' · ');
}

function formField(label, name, value='', type='text', options=null, full=false) {
  if (options) {
    return '<div class="form-field '+(full?'full-field':'')+'"><label>'+escapeHtml(label)+'</label><select id="modal_'+name+'">'+options.map(o=>'<option value="'+escapeHtml(o.value)+'" '+(String(o.value)===String(value)?'selected':'')+'>'+escapeHtml(o.label)+'</option>').join('')+'</select></div>';
  }
  return '<div class="form-field '+(full?'full-field':'')+'"><label for="modal_'+name+'">'+escapeHtml(label)+'</label><input id="modal_'+name+'" type="'+type+'" value="'+escapeHtml(value ?? '')+'" autocomplete="off"></div>';
}

function formTextarea(label, name, value='', full=true) {
  return '<div class="form-field '+(full?'full-field':'')+'"><label for="modal_'+name+'">'+escapeHtml(label)+'</label><textarea id="modal_'+name+'">'+escapeHtml(value ?? '')+'</textarea></div>';
}

function checkboxField(label, name, checked=false) {
  return '<div class="checkbox-field full-field"><input id="modal_'+name+'" type="checkbox" '+(checked?'checked':'')+'><label for="modal_'+name+'">'+escapeHtml(label)+'</label></div>';
}

async function hasPermission() {
  const checks = await Promise.all([
    supabaseClient.rpc('amanah_has_permission',{p_permission_key:'master_data.projects'}),
    supabaseClient.rpc('amanah_has_permission',{p_permission_key:'schedule.manage'})
  ]);
  return checks.some(x => !x.error && x.data === true);
}

async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    location.href = 'admin.html';
    return false;
  }
  if (!(await hasPermission())) {
    qs('notice').textContent = 'You do not have permission to manage project structure.';
    qs('notice').className = 'notice err';
    return false;
  }
  return true;
}

async function loadProject() {
  const { data, error } = await supabaseClient.from('projects').select('project_id,project_name,project_type,client,location,site_engineer,start_date,target_completion,current_progress,status,project_details').eq('project_id',projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Project not found.');
  if (data.project_type !== 'CONCRETING OF ROAD') throw new Error('Road Project Structure is only available for CONCRETING OF ROAD projects.');
  state.project = data;

  const details = data.project_details || {};
  qs('projectName').textContent = data.project_name || '—';
  qs('projectMeta').textContent = [data.project_id, data.client, data.location, data.site_engineer].filter(Boolean).join(' • ') || '—';
  qs('roadLength').textContent = details.road_length ? formatNum(details.road_length)+' m' : '—';
  const shoulders = details.road_shouldering === true || String(details.road_shouldering).toUpperCase()==='YES';
  qs('roadShouldering').textContent = shoulders ? 'YES' : 'NO';
}

async function loadStructure() {
  const {data: phases, error: phaseError} = await supabaseClient
    .from('project_phases')
    .select('*')
    .eq('project_id', projectId)
    .order('sequence_no')
    .order('created_at');
  if (phaseError) throw phaseError;

  const phaseRows = phases || [];
  const phaseIds = phaseRows.map(x => x.phase_id);

  let sectionRows = [];
  if (phaseIds.length) {
    const {data, error} = await supabaseClient
      .from('project_sections')
      .select('*')
      .in('phase_id', phaseIds)
      .order('station_start_m', {nullsFirst:true})
      .order('created_at');
    if (error) throw error;
    sectionRows = data || [];
  }

  const sectionIds = sectionRows.map(x => x.section_id);
  let componentRows = [];
  if (sectionIds.length) {
    const {data, error} = await supabaseClient
      .from('project_work_components')
      .select('*')
      .in('section_id', sectionIds)
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    componentRows = data || [];
  }

  state.phases = phaseRows;
  state.sections = sectionRows;
  state.components = componentRows;

  if (!state.phases.some(x=>x.phase_id===state.selectedPhaseId)) {
    state.selectedPhaseId = state.phases[0]?.phase_id || null;
  }
  const visibleSections = state.sections.filter(x=>x.phase_id===state.selectedPhaseId);
  if (!visibleSections.some(x=>x.section_id===state.selectedSectionId)) {
    state.selectedSectionId = visibleSections[0]?.section_id || null;
  }

  renderAll();
}

function renderAll() {
  renderPhases();
  renderSections();
  renderComponents();
  qs('phaseCount').textContent = String(state.phases.length);
  qs('sectionCount').textContent = String(state.sections.length);
  qs('componentCount').textContent = String(state.components.length);
}

function renderPhases() {
  const body = qs('phaseList');
  if (!state.phases.length) {
    body.innerHTML = '<div class="empty-state">No phases yet. Start by adding Phase 1.</div>';
    return;
  }
  body.innerHTML = state.phases.map(p => {
    const selected = p.phase_id === state.selectedPhaseId;
    const count = state.sections.filter(s=>s.phase_id===p.phase_id).length;
    return '<article class="entity-card '+(selected?'selected':'')+'"><div class="entity-main"><div><div class="entity-title">'+escapeHtml(phaseLabel(p))+'</div><div class="entity-sub">'+(p.planned_start||p.planned_end?escapeHtml((p.planned_start||'')+' → '+(p.planned_end||'')):'No planned dates')+'</div><div class="entity-stats">'+statusPill(p.status)+'<span class="pill">'+count+' SECTION'+(count===1?'':'S')+'</span></div></div><div class="entity-actions"><button class="mini-btn select" data-action="select-phase" data-id="'+p.phase_id+'">OPEN</button><button class="mini-btn edit" data-action="edit-phase" data-id="'+p.phase_id+'">EDIT</button><button class="mini-btn delete" data-action="delete-phase" data-id="'+p.phase_id+'">DELETE</button></div></div></article>';
  }).join('');
  qs('selectedPhaseBanner').textContent = state.selectedPhaseId ? 'Selected: '+phaseLabel(state.phases.find(x=>x.phase_id===state.selectedPhaseId)||{}) : 'Select a phase to manage its road sections.';
}

function renderSections() {
  const body = qs('sectionList');
  const add = qs('addSectionButton');
  add.disabled = !state.selectedPhaseId;
  const visible = state.sections.filter(s=>s.phase_id===state.selectedPhaseId);
  if (!state.selectedPhaseId) {
    body.innerHTML = '<div class="empty-state">Select a phase first.</div>';
    return;
  }
  if (!visible.length) {
    body.innerHTML = '<div class="empty-state">No road sections yet. Add the first station range for this phase.</div>';
    return;
  }
  body.innerHTML = visible.map(s => {
    const selected = s.section_id === state.selectedSectionId;
    const count = state.components.filter(c=>c.section_id===s.section_id).length;
    return '<article class="entity-card '+(selected?'selected':'')+'"><div class="entity-main"><div><div class="entity-title">'+escapeHtml(sectionLabel(s))+'</div><div class="entity-sub">'+stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m)+'</div><div class="entity-stats">'+statusPill(s.status)+'<span class="pill">'+(s.route_length_m!==null?formatNum(s.route_length_m)+' M':'NO LENGTH')+'</span><span class="pill">'+count+' COMPONENT'+(count===1?'':'S')+'</span></div></div><div class="entity-actions"><button class="mini-btn select" data-action="select-section" data-id="'+s.section_id+'">OPEN</button><button class="mini-btn edit" data-action="edit-section" data-id="'+s.section_id+'">EDIT</button><button class="mini-btn delete" data-action="delete-section" data-id="'+s.section_id+'">DELETE</button></div></div></article>';
  }).join('');
  qs('selectedSectionBanner').textContent = state.selectedSectionId ? 'Selected: '+sectionLabel(state.sections.find(x=>x.section_id===state.selectedSectionId)||{}) : 'Select a road section to manage its work components.';
}

function renderComponents() {
  const body = qs('componentList');
  const add = qs('addComponentButton');
  const quick = qs('quickTwoLaneButton');
  add.disabled = !state.selectedSectionId;
  quick.disabled = !state.selectedSectionId;
  if (!state.selectedSectionId) {
    body.innerHTML = '<div class="empty-state">Select a road section first.</div>';
    return;
  }
  const visible = state.components.filter(c=>c.section_id===state.selectedSectionId);
  if (!visible.length) {
    body.innerHTML = '<div class="empty-state">No work components yet. Create the two standard lanes, then add shoulders only when they exist on the project.</div>';
    return;
  }
  body.innerHTML = visible.map(c => '<article class="component-card"><div class="component-name"><strong>'+escapeHtml(c.component_name)+'</strong><small>'+escapeHtml(typeSideLabel(c))+(c.is_optional?' · OPTIONAL':'')+'</small></div><div class="component-cell"><small>STATION</small><strong>'+stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m)+'</strong></div><div class="component-cell"><small>PLANNED</small><strong>'+formatNum(c.planned_quantity)+' '+escapeHtml(c.quantity_unit)+'</strong></div><div class="component-cell"><small>STATUS</small><strong>'+statusPill(c.status)+'</strong></div><div class="entity-actions"><button class="mini-btn edit" data-action="edit-component" data-id="'+c.work_component_id+'">EDIT</button><button class="mini-btn delete" data-action="delete-component" data-id="'+c.work_component_id+'">DELETE</button></div></article>').join('');
  qs('selectedSectionBanner').textContent = 'Selected: '+sectionLabel(state.sections.find(x=>x.section_id===state.selectedSectionId)||{})+' • '+visible.length+' work component'+(visible.length===1?'':'s');
}

function openModal(type, mode='add', record=null) {
  state.modal = {type,mode,record};
  const titleMap = {phase:'PHASE',section:'ROAD SECTION',component:'WORK COMPONENT'};
  qs('modalEyebrow').textContent = titleMap[type] || 'ROAD STRUCTURE';
  qs('modalTitle').textContent = mode==='add' ? 'ADD '+titleMap[type] : 'EDIT '+titleMap[type];

  if (type==='phase') {
    const p = record || {};
    qs('modalFields').innerHTML =
      formField('Phase Code','phase_code',p.phase_code||'') +
      formField('Phase Name','phase_name',p.phase_name||'', 'text', null, true) +
      formField('Sequence No.','sequence_no',p.sequence_no || nextPhaseSequence(),'number') +
      formField('Status','status',p.status||'PLANNED','select',[{value:'PLANNED',label:'PLANNED'},{value:'IN PROGRESS',label:'IN PROGRESS'},{value:'DONE',label:'DONE'},{value:'ON HOLD',label:'ON HOLD'},{value:'CANCELLED',label:'CANCELLED'}]) +
      formField('Planned Start','planned_start',p.planned_start||'','date') +
      formField('Planned End','planned_end',p.planned_end||'','date') +
      formField('Actual End','actual_end',p.actual_end||'','date') +
      formTextarea('Notes','notes',p.notes||'');
  }

  if (type==='section') {
    const s = record || {};
    qs('modalFields').innerHTML =
      formField('Section Code','section_code',s.section_code||'') +
      formField('Section Name','section_name',s.section_name||'', 'text', null, true) +
      formField('Station Start (m)','station_start_m',s.station_start_m ?? '') +
      formField('Station End (m)','station_end_m',s.station_end_m ?? '') +
      formField('Status','status',s.status||'PLANNED','select',[{value:'PLANNED',label:'PLANNED'},{value:'IN PROGRESS',label:'IN PROGRESS'},{value:'DONE',label:'DONE'},{value:'ON HOLD',label:'ON HOLD'},{value:'CANCELLED',label:'CANCELLED'}]) +
      formTextarea('Notes','notes',s.notes||'');
  }

  if (type==='component') {
    const c = record || {};
    const selectedSection = state.sections.find(s=>s.section_id===state.selectedSectionId);
    qs('modalFields').innerHTML =
      formField('Component Type','component_type',c.component_type||'LANE','select',[
        {value:'LANE',label:'LANE'},
        {value:'SHOULDER',label:'SHOULDER'},
        {value:'MEDIAN',label:'MEDIAN'},
        {value:'DRAINAGE',label:'DRAINAGE'},
        {value:'SIDEWALK',label:'SIDEWALK'},
        {value:'OTHER',label:'OTHER'}
      ]) +
      formField('Side','component_side',c.component_side||'NONE','select',[
        {value:'LEFT',label:'LEFT'},{value:'RIGHT',label:'RIGHT'},{value:'CENTER',label:'CENTER'},{value:'NONE',label:'NONE'}
      ]) +
      formField('Component Name','component_name',c.component_name||'','text',null,true) +
      formField('Station Start (m)','station_start_m',c.station_start_m ?? (selectedSection?.station_start_m ?? '')) +
      formField('Station End (m)','station_end_m',c.station_end_m ?? (selectedSection?.station_end_m ?? '')) +
      formField('Planned Quantity','planned_quantity',c.planned_quantity ?? (selectedSection?.route_length_m ?? 0)) +
      formField('Quantity Unit','quantity_unit',c.quantity_unit||'M','select',[
        {value:'M',label:'M (METERS)'},{value:'KM',label:'KM (KILOMETERS)'},{value:'M²',label:'M²'},{value:'M³',label:'M³'},{value:'PC',label:'PC'},{value:'SET',label:'SET'},{value:'OTHER',label:'OTHER'}
      ]) +
      formField('Status','status',c.status||'PLANNED','select',[{value:'PLANNED',label:'PLANNED'},{value:'IN PROGRESS',label:'IN PROGRESS'},{value:'DONE',label:'DONE'},{value:'ON HOLD',label:'ON HOLD'},{value:'CANCELLED',label:'CANCELLED'}]) +
      checkboxField('This work component is optional for the project','is_optional',c.is_optional===true) +
      checkboxField('Component is active','is_active',c.is_active!==false) +
      formField('Sort Order','sort_order',c.sort_order||nextComponentSort(),'number') +
      formTextarea('Notes','notes',c.notes||'');
    qs('modal_component_type')?.addEventListener('change', () => {
      const type = qs('modal_component_type').value;
      const optional = qs('modal_is_optional');
      if (optional && type==='SHOULDER') optional.checked = true;
    });
  }

  qs('entityModal').classList.remove('hidden');
  setTimeout(()=>qs('modal_'+(type==='phase'?'phase_name':type==='section'?'section_name':'component_name'))?.focus(),30);
}

function closeModal() {
  qs('entityModal').classList.add('hidden');
  state.modal = {type:null,mode:'add',record:null};
}

function readModalValues() {
  const m = state.modal;
  const get = key => qs('modal_'+key);
  if (m.type==='phase') {
    return {
      phase_code:get('phase_code').value.trim()||null,
      phase_name:get('phase_name').value.trim(),
      sequence_no:Math.max(1,parseInt(get('sequence_no').value||'1',10)),
      status:get('status').value,
      planned_start:get('planned_start').value||null,
      planned_end:get('planned_end').value||null,
      actual_end:get('actual_end').value||null,
      notes:get('notes').value.trim()||null
    };
  }
  if (m.type==='section') {
    return {
      section_code:get('section_code').value.trim()||null,
      section_name:get('section_name').value.trim(),
      station_start_m:nullableNumber(get('station_start_m').value),
      station_end_m:nullableNumber(get('station_end_m').value),
      status:get('status').value,
      notes:get('notes').value.trim()||null
    };
  }
  return {
    component_type:get('component_type').value,
    component_side:get('component_side').value,
    component_name:get('component_name').value.trim(),
    station_start_m:nullableNumber(get('station_start_m').value),
    station_end_m:nullableNumber(get('station_end_m').value),
    planned_quantity:Math.max(0,Number(get('planned_quantity').value||0)),
    quantity_unit:get('quantity_unit').value,
    status:get('status').value,
    is_optional:get('is_optional').checked,
    is_active:get('is_active').checked,
    sort_order:Math.max(1,parseInt(get('sort_order').value||'1',10)),
    notes:get('notes').value.trim()||null
  };
}

function nullableNumber(value) {
  if (String(value).trim()==='') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Station values must be valid numbers.');
  return n;
}

function nextPhaseSequence() {
  return state.phases.reduce((m,p)=>Math.max(m,Number(p.sequence_no)||0),0)+1;
}

function nextComponentSort() {
  return state.components.filter(c=>c.section_id===state.selectedSectionId).reduce((m,c)=>Math.max(m,Number(c.sort_order)||0),0)+1;
}

function deriveComponentName(values) {
  if (values.component_name) return values.component_name;
  if (values.component_type==='LANE' && values.component_side==='LEFT') return 'LEFT LANE';
  if (values.component_type==='LANE' && values.component_side==='RIGHT') return 'RIGHT LANE';
  if (values.component_type==='SHOULDER' && values.component_side==='LEFT') return 'LEFT SHOULDER';
  if (values.component_type==='SHOULDER' && values.component_side==='RIGHT') return 'RIGHT SHOULDER';
  if (values.component_type==='MEDIAN') return 'MEDIAN';
  if (values.component_type==='DRAINAGE' && values.component_side==='LEFT') return 'LEFT DRAINAGE';
  if (values.component_type==='DRAINAGE' && values.component_side==='RIGHT') return 'RIGHT DRAINAGE';
  if (values.component_type==='SIDEWALK' && values.component_side==='LEFT') return 'LEFT SIDEWALK';
  if (values.component_type==='SIDEWALK' && values.component_side==='RIGHT') return 'RIGHT SIDEWALK';
  return values.component_type + (values.component_side!=='NONE'?' — '+values.component_side:'');
}

async function saveModal() {
  const m = state.modal;
  const values = readModalValues();
  if (m.type==='phase' && !values.phase_name) throw new Error('Phase Name is required.');
  if (m.type==='section' && !values.section_name) throw new Error('Section Name is required.');
  if (m.type==='component') {
    values.component_name = deriveComponentName(values);
    if (!values.component_name) throw new Error('Component Name is required.');
  }

  if (m.type==='section' && values.station_start_m!==null && values.station_end_m!==null && values.station_end_m < values.station_start_m) {
    throw new Error('Station End cannot be lower than Station Start.');
  }
  if (m.type==='component' && values.station_start_m!==null && values.station_end_m!==null && values.station_end_m < values.station_start_m) {
    throw new Error('Station End cannot be lower than Station Start.');
  }

  if (m.type==='phase') {
    const payload={...values,project_id:projectId};
    const q = m.mode==='add'
      ? supabaseClient.from('project_phases').insert(payload)
      : supabaseClient.from('project_phases').update({...payload,updated_at:new Date().toISOString()}).eq('phase_id',m.record.phase_id);
    const {error}=await q; if(error) throw error;
  } else if (m.type==='section') {
    const payload={...values,phase_id:state.selectedPhaseId};
    const q = m.mode==='add'
      ? supabaseClient.from('project_sections').insert(payload).select('section_id').single()
      : supabaseClient.from('project_sections').update({...payload,updated_at:new Date().toISOString()}).eq('section_id',m.record.section_id).select('section_id').single();
    const {data:sectionData,error}=await q; if(error) throw error;

    const sectionId=sectionData?.section_id||m.record?.section_id;
    if(!sectionId) throw new Error('Unable to determine the saved road section.');
    const {error:geometryError}=await supabaseClient.rpc('refresh_road_section_geometry',{p_section_id:sectionId});
    if(geometryError) throw geometryError;
  } else {
    const payload={...values,section_id:state.selectedSectionId};
    const q = m.mode==='add'
      ? supabaseClient.from('project_work_components').insert(payload).select('work_component_id').single()
      : supabaseClient.from('project_work_components').update({...payload,updated_at:new Date().toISOString()}).eq('work_component_id',m.record.work_component_id).select('work_component_id').single();
    const {data:componentData,error}=await q; if(error) throw error;

    const componentId=componentData?.work_component_id||m.record?.work_component_id;
    if(!componentId) throw new Error('Unable to determine the saved work component.');
    if(values.is_active!==false){
      const {error:geometryError}=await supabaseClient.rpc('refresh_road_work_component_geometry',{p_work_component_id:componentId});
      if(geometryError) throw geometryError;
    }
  }
  closeModal();
  await loadStructure();
  if (window.AMANAHRoadMap?.refresh) await window.AMANAHRoadMap.refresh();
  showNotice((m.mode==='add'?'Added ':'Updated ')+m.type+'.','ok');
}

async function quickTwoLaneSet() {
  const section = state.sections.find(s=>s.section_id===state.selectedSectionId);
  if (!section) return;
  const start = section.station_start_m;
  const end = section.station_end_m;
  const qty = section.route_length_m || 0;
  const existingNames = new Set(state.components.filter(c=>c.section_id===section.section_id).map(c=>c.component_name.toUpperCase()));
  const rows = [
    {component_type:'LANE',component_side:'LEFT',component_name:'LEFT LANE'},
    {component_type:'LANE',component_side:'RIGHT',component_name:'RIGHT LANE'}
  ].filter(x=>!existingNames.has(x.component_name));
  if (!rows.length) {
    showNotice('LEFT LANE and RIGHT LANE already exist for this section.','ok'); return;
  }
  const {data:inserted,error}=await supabaseClient.from('project_work_components').insert(rows.map((x,i)=>({
    ...x,section_id:section.section_id,station_start_m:start,station_end_m:end,planned_quantity:qty,quantity_unit:'M',status:'PLANNED',is_optional:false,is_active:true,sort_order:i+1
  }))).select('work_component_id');
  if(error) throw error;
  for(const row of (inserted||[])){
    const {error:geometryError}=await supabaseClient.rpc('refresh_road_work_component_geometry',{p_work_component_id:row.work_component_id});
    if(geometryError) throw geometryError;
  }
  await loadStructure();
  if (window.AMANAHRoadMap?.refresh) await window.AMANAHRoadMap.refresh();
  showNotice('Standard LEFT LANE + RIGHT LANE components created. Shoulders remain optional.','ok');
}

async function deleteRecord(type,id) {
  const config={
    phase:{table:'project_phases',column:'phase_id',label:'phase'},
    section:{table:'project_sections',column:'section_id',label:'road section'},
    component:{table:'project_work_components',column:'work_component_id',label:'work component'}
  }[type];
  if(!config) return;
  const message=type==='phase'
    ? 'Deleting a phase also deletes its road sections and work components.'
    : type==='section'
      ? 'Deleting a road section also deletes its work components.'
      : 'Delete this work component?';
  if(!confirm(message)) return;
  const {error}=await supabaseClient.from(config.table).delete().eq(config.column,id);
  if(error) { showNotice('Unable to delete '+config.label+': '+error.message,'err'); return; }
  if(type==='phase') {
    if(state.selectedPhaseId===id) { state.selectedPhaseId=null; state.selectedSectionId=null; }
  }
  if(type==='section' && state.selectedSectionId===id) state.selectedSectionId=null;
  await loadStructure();
  if (window.AMANAHRoadMap?.refresh) await window.AMANAHRoadMap.refresh();
  showNotice('Deleted '+config.label+'.','ok');
}

function bindEvents() {
  qs('backToProjects').addEventListener('click',()=>location.href='admin.html');
  qs('addPhaseButton').addEventListener('click',()=>openModal('phase'));
  qs('addSectionButton').addEventListener('click',()=>openModal('section'));
  qs('addComponentButton').addEventListener('click',()=>openModal('component'));
  qs('quickTwoLaneButton').addEventListener('click',()=>quickTwoLaneSet());
  qs('modalClose').addEventListener('click',closeModal);
  qs('modalCancel').addEventListener('click',closeModal);
  qs('entityModal').addEventListener('click',e=>{if(e.target===qs('entityModal'))closeModal();});
  qs('entityForm').addEventListener('submit',async e=>{e.preventDefault();try{await saveModal();}catch(err){showNotice(err.message||'Unable to save.','err');}});
  qs('phaseList').addEventListener('click',e=>handleAction(e,'phase'));
  qs('sectionList').addEventListener('click',e=>handleAction(e,'section'));
  qs('componentList').addEventListener('click',e=>handleAction(e,'component'));
}

function handleAction(event, fallbackType) {
  const button=event.target.closest('[data-action]');
  if(!button) return;
  const action=button.dataset.action;
  const id=button.dataset.id;
  if(action==='select-phase') { state.selectedPhaseId=id; state.selectedSectionId=null; renderAll(); return; }
  if(action==='select-section') { state.selectedSectionId=id; renderAll(); return; }
  if(action==='edit-phase') { openModal('phase','edit',state.phases.find(x=>x.phase_id===id)); return; }
  if(action==='edit-section') { openModal('section','edit',state.sections.find(x=>x.section_id===id)); return; }
  if(action==='edit-component') { openModal('component','edit',state.components.find(x=>x.work_component_id===id)); return; }
  if(action==='delete-phase'||action==='delete-section'||action==='delete-component') { deleteRecord(action.split('-')[1],id); return; }
}

async function init() {
  if (!projectId) throw new Error('Missing project_id in the page URL.');
  if (!(await requireSession())) return;
  await loadProject();
  await loadStructure();
  bindEvents();
  if (window.AMANAHRoadMap?.init) await window.AMANAHRoadMap.init();
}

supabaseClient.auth.onAuthStateChange((_event,session)=>{
  if(!session) location.href='admin.html';
});

document.addEventListener('DOMContentLoaded',async()=>{
  try{await init();}catch(error){showNotice(error.message||'Unable to load road project structure.','err');}
});
