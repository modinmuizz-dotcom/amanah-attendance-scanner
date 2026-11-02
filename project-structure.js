/* Project Structure: scope authoring and versioned baselines. */
const supabaseClient = window.supabase.createClient(
  'https://bafmycjninxomufhkjvy.supabase.co',
  'sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ'
);
window.supabaseClient = supabaseClient;
(function () {
  'use strict';
  const M = window.AmanahProjectStructure;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {projects: [], project: null, structure: null, groups: [], events: [], canManage: false, dirty: false, busy: false, generation: 0};
  const clone = value => JSON.parse(JSON.stringify(value));
  const pct = value => (value / 100).toFixed(2) + '%';
  const editable = () => state.canManage && state.structure?.status !== 'BASELINED' && !state.busy;
  const dateLabel = value => value ? new Date(value).toLocaleString('en-PH', {timeZone:'Asia/Manila',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}) : '';

  function message(text = '', error = false) {
    const node = $('structureMessage');
    node.textContent = text;
    node.classList.toggle('error', error);
    node.hidden = !text;
  }
  async function timed(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('The request timed out. Reload the saved structure before trying again.')), 15000);
      })]);
    } finally { window.clearTimeout(timer); }
  }
  async function rpc(name, params) {
    const {data, error} = await timed(supabaseClient.rpc(name, params));
    if (error) throw error;
    return data;
  }
  function empty(title, text, retry = false) {
    $('structureWorkspace').hidden = true;
    $('structureEmpty').hidden = false;
    $('structureEmpty').innerHTML = '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
      (retry ? '<button type="button" class="ps-button primary" data-retry-structure>Retry</button>' : '');
  }
  function setBusy(busy) {
    state.busy = busy;
    $('structureProject').disabled = busy;
    renderControls();
    $('structureGroups').querySelectorAll('input').forEach(input => input.disabled = !editable());
  }
  function renderControls() {
    if (!state.project) return;
    const draft = state.structure?.status !== 'BASELINED';
    const s = M.summary(state.groups);
    $('loadStructureTemplate').hidden = !state.canManage || !draft;
    $('addStructureGroup').hidden = !state.canManage || !draft;
    $('saveStructure').hidden = !state.canManage || !draft;
    $('baselineStructure').hidden = !state.canManage || !draft;
    $('reopenStructure').hidden = !state.canManage || draft;
    $('loadStructureTemplate').disabled = !editable();
    $('addStructureGroup').disabled = !editable() || state.groups.length >= 20;
    $('saveStructure').disabled = !editable() || !state.dirty;
    $('baselineStructure').disabled = !editable() || state.dirty || !state.structure || s.assigned !== 10000 || s.unassigned > 0 || !s.items || state.groups.some(g => !g.items.length);
    $('reopenStructure').disabled = state.busy;
    $('reloadStructure').disabled = state.busy;
    $('structureDirty').hidden = !state.dirty;
    $('structureGroups').querySelectorAll('[data-add-item],[data-delete-item],[data-delete-group]').forEach(button => button.disabled = !editable());
    $('structureAccessNote').textContent = !state.canManage ? 'View access. An authorized engineer or project administrator manages this structure.' :
      !draft ? 'The baseline is locked. Use Revise baseline to record a scope or weight change with a reason.' :
      'Save the draft first. Set baseline becomes available when every item has a positive weight and the total is exactly 100%.';
  }
  function renderSummary() {
    const s = M.summary(state.groups);
    $('scopeGroups').textContent = s.groups;
    $('scopeItems').textContent = s.items;
    $('scopeWeight').textContent = pct(s.assigned);
    $('scopeRemaining').textContent = pct(s.remaining);
    $('scopeRemaining').classList.toggle('is-invalid', s.remaining < 0);
    $('scopeUnassigned').textContent = s.unassigned + ' item' + (s.unassigned === 1 ? '' : 's') + ' awaiting a weight';
    $('scopeBar').style.width = Math.min(100, Math.max(0, s.assigned / 100)) + '%';
    $('scopeBar').parentElement.setAttribute('aria-valuenow', Math.min(100, Math.max(0, s.assigned / 100)));
    for (const group of state.groups) {
      const node = $('structureGroups').querySelector('[data-group-weight="' + group.id + '"]');
      if (node) node.textContent = pct(M.summary([group]).assigned);
    }
    renderControls();
  }
  function renderGroups() {
    const disabled = editable() ? '' : ' disabled';
    const actions = state.canManage && state.structure?.status !== 'BASELINED';
    $('structureGroups').innerHTML = state.groups.length ? state.groups.map((group, index) => {
      const rows = group.items.map(item => '<tr data-group="' + esc(group.id) + '" data-item="' + esc(item.id) + '">' +
        '<td><input data-field="name" aria-label="Work item name" maxlength="200" value="' + esc(item.name) + '"' + disabled + '></td>' +
        '<td><input data-field="location" aria-label="Block, floor, room or area" maxlength="160" placeholder="Optional location" value="' + esc(item.location) + '"' + disabled + '></td>' +
        '<td><input data-field="weight" aria-label="Work item weight as percent of project" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="' + esc(item.weight) + '"' + disabled + '></td>' +
        '<td><input data-field="planned_start" aria-label="Planned start" type="date" value="' + esc(item.planned_start || '') + '"' + disabled + '></td>' +
        '<td><input data-field="planned_end" aria-label="Planned finish" type="date" value="' + esc(item.planned_end || '') + '"' + disabled + '></td>' +
        (actions ? '<td><button type="button" class="ps-button danger" data-delete-item="' + esc(item.id) + '" data-group="' + esc(group.id) + '">Remove</button></td>' : '') + '</tr>').join('');
      return '<section class="ps-card ps-group" data-group="' + esc(group.id) + '">' +
        '<div class="ps-group-head"><div class="ps-group-title"><span>' + String(index + 1).padStart(2, '0') + '</span>' +
        '<input class="ps-group-name" data-group-name="' + esc(group.id) + '" maxlength="100" aria-label="Work group name" value="' + esc(group.name) + '"' + disabled + '></div>' +
        '<div class="ps-group-meta"><span>PROJECT SHARE <strong data-group-weight="' + esc(group.id) + '">' + pct(M.summary([group]).assigned) + '</strong></span>' +
        (actions ? '<button type="button" class="ps-button danger" data-delete-group="' + esc(group.id) + '">Remove group</button>' : '') + '</div></div>' +
        '<div class="ps-scroll"><table class="ps-table"><thead><tr><th scope="col">WORK ITEM</th><th scope="col">LOCATION / AREA</th><th scope="col">WEIGHT (%)</th><th scope="col">PLANNED START</th><th scope="col">PLANNED FINISH</th>' +
        (actions ? '<th scope="col">ACTION</th>' : '') + '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" class="ps-empty-inline">Add the work items that belong to this group.</td></tr>') + '</tbody></table></div>' +
        '<div class="ps-group-foot"><span>' + group.items.length + ' work item' + (group.items.length === 1 ? '' : 's') + '</span>' +
        (actions ? '<button type="button" class="ps-button secondary" data-add-item="' + esc(group.id) + '">+ Add work item</button>' : '<span>Saved ' + (state.structure?.status === 'BASELINED' ? 'baseline' : 'draft') + ' scope</span>') + '</div></section>';
    }).join('') : '<section class="ps-card ps-empty"><h2>No work groups yet</h2><p>Load the project template or add a work group to start defining the scope.</p></section>';
  }
  function render() {
    if (!state.project) return;
    $('structureEmpty').hidden = true;
    $('structureWorkspace').hidden = false;
    $('structureProjectName').textContent = state.project.project_name;
    $('structureType').textContent = state.project.project_type;
    $('structureProjectMeta').textContent = [state.project.project_id, state.project.location].filter(Boolean).join(' · ');
    const ready = state.structure?.status === 'BASELINED';
    $('structureStatus').textContent = ready ? 'BASELINE V' + state.structure.baseline_version : state.structure ? 'DRAFT · V' + state.structure.baseline_version : 'NEW STRUCTURE';
    $('structureStatus').classList.toggle('ready', ready);
    $('structureSaved').textContent = state.structure ? 'Saved ' + dateLabel(state.structure.updated_at) : 'No saved draft';
    $('structureEvents').innerHTML = state.events.length ? state.events.map(event =>
      '<div class="ps-event"><time>' + esc(dateLabel(event.occurred_at)) + '</time><div><strong>' +
      esc(({DRAFT_SAVED:'Draft saved',BASELINE_SET:'Baseline set',BASELINE_REOPENED:'Baseline reopened'})[event.event_type] || event.event_type) +
      ' · V' + esc(event.baseline_version) + '</strong><p>' + esc(event.actor_label || 'Authorized team member') +
      (event.reason ? '\n' + esc(event.reason) : '') + '</p></div></div>'
    ).join('') : '<p class="ps-note">Baseline records will appear after the first save.</p>';
    renderGroups();
    renderSummary();
  }
  function markDirty() { state.dirty = true; renderSummary(); }
  async function confirmAction(title, text, reason = false) {
    const dialog = $('structureConfirm');
    $('structureDialogTitle').textContent = title;
    $('structureDialogText').textContent = text;
    $('structureReasonWrap').hidden = !reason;
    $('structureReason').required = reason;
    $('structureReason').value = '';
    dialog.returnValue = '';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? {reason: $('structureReason').value.trim()} : null), {once:true});
      dialog.showModal();
    });
  }
  async function loadProject(id) {
    const generation = ++state.generation;
    state.project = null;state.structure = null;state.groups = [];state.events = [];state.canManage = false;state.dirty = false;
    message();
    if (!id) { empty('Select a project to define its work structure', 'Choose a school building, multi-purpose building, covered court or water system.');return; }
    state.busy = true;$('structureProject').disabled = true;
    empty('Loading project structure…', 'Opening the saved scope and baseline record.');
    try {
      const data = await rpc('amanah_project_structure_get', {p_project_id:id});
      if (generation !== state.generation) return;
      state.project = data.project;state.structure = data.structure;state.groups = clone(data.structure?.groups || []);
      state.events = data.events || [];state.canManage = data.can_manage === true;
      history.replaceState(null, '', 'project-structure.html?project_id=' + encodeURIComponent(id));
      state.busy = false;render();
    } catch (error) {
      if (generation !== state.generation) return;
      empty('Project Structure could not be loaded', 'Retry the request or select another project.', true);
      message(error.message || 'Unable to open Project Structure.', true);
    } finally { if (generation === state.generation) {state.busy = false;$('structureProject').disabled = false;} }
  }
  async function command(action, reason = '') {
    if (!state.project || state.busy || !state.canManage) return;
    const id = state.project.project_id, generation = state.generation;
    let groups = null;
    try {
      if (action === 'SAVE') {groups = M.clean(state.groups);M.validate(groups);}
      if (action === 'BASELINE') M.validate(state.groups, true);
    } catch (error) {message(error.message, true);return;}
    setBusy(true);message();
    try {
      const saved = await rpc('amanah_project_structure_write', {p_project_id:id,p_action:action,p_groups:groups,p_expected_revision:state.structure?.revision || 0,p_reason:reason});
      if (generation !== state.generation) return;
      state.structure = saved;state.groups = clone(saved.groups);state.dirty = false;
      let feedback = ({SAVE:'Draft saved successfully.',BASELINE:'Baseline set successfully. The scope and weights are now locked.',REOPEN:'A new draft version is ready. The earlier baseline has been retained in the record.'})[action];
      try {
        const fresh = await rpc('amanah_project_structure_get', {p_project_id:id});
        if (generation !== state.generation) return;
        state.events = fresh.events || [];state.structure = fresh.structure;state.groups = clone(fresh.structure.groups);state.canManage = fresh.can_manage === true;
      } catch (_) {feedback += ' Reload saved to refresh the baseline record.';}
      message(feedback);
    } catch (error) {
      message((error.code === '40001' ? 'Another user changed this structure. Your unsaved work is still on screen. Reload the saved version before continuing.\n' : '') + (error.message || 'Unable to save the structure.'), true);
    } finally { if (generation === state.generation) {state.busy = false;render();$('structureProject').disabled = false;} }
  }
  function bindEvents() {
    $('structureDialogCancel').addEventListener('click', () => $('structureConfirm').close('cancel'));
    $('structureProject').addEventListener('change', async event => {
      const target = event.target.value;
      if (state.dirty && !await confirmAction('Discard unsaved changes?', 'Open the other project using its saved structure. The current unsaved edits will be discarded.')) {
        event.target.value = state.project?.project_id || '';return;
      }
      loadProject(target);
    });
    $('structureEmpty').addEventListener('click', event => {if (event.target.closest('[data-retry-structure]')) loadProject($('structureProject').value);});
    $('reloadStructure').addEventListener('click', async () => {
      if (state.dirty && !await confirmAction('Reload saved structure?', 'Discard the current unsaved edits and open the latest saved version.')) return;
      loadProject(state.project.project_id);
    });
    $('loadStructureTemplate').addEventListener('click', async () => {
      if (!editable()) return;
      if (state.groups.length && !await confirmAction('Replace this draft with the template?', 'The current draft work items and weights will be replaced on screen. Review the template and save when ready.')) return;
      state.groups = M.template(state.project.project_type);state.dirty = true;render();
      message('Template loaded. Remove work outside the project scope and assign weights before saving.');
    });
    $('addStructureGroup').addEventListener('click', () => {
      if (!editable() || state.groups.length >= 20) return;
      const group = M.newGroup();state.groups.push(group);state.dirty = true;render();
      const input = $('structureGroups').querySelector('[data-group-name="' + group.id + '"]');input?.focus();input?.select();
    });
    $('structureGroups').addEventListener('input', event => {
      if (!editable()) return;
      const input = event.target;
      const groupId = input.dataset.groupName || input.closest('[data-group]')?.dataset.group;
      const group = state.groups.find(g => g.id === groupId);if (!group) return;
      if (input.dataset.groupName) group.name = input.value;
      else {
        const item = group.items.find(i => i.id === input.closest('[data-item]')?.dataset.item);
        const field = input.dataset.field;
        if (!item || !['name','location','weight','planned_start','planned_end'].includes(field)) return;
        item[field] = field === 'weight' ? Number(input.value) : field.startsWith('planned_') ? (input.value || null) : input.value;
      }
      markDirty();
    });
    $('structureGroups').addEventListener('click', async event => {
      if (!editable()) return;
      const button = event.target.closest('button');if (!button) return;
      const groupId = button.dataset.addItem || button.dataset.deleteGroup || button.dataset.group;
      const group = state.groups.find(g => g.id === groupId);if (!group) return;
      if (button.dataset.addItem) {
        if (M.summary(state.groups).items >= 400) {message('A structure can contain up to 400 work items.', true);return;}
        const item = M.newItem();group.items.push(item);state.dirty = true;render();
        const input = $('structureGroups').querySelector('[data-item="' + item.id + '"] [data-field="name"]');input?.focus();input?.select();
      } else if (button.dataset.deleteGroup) {
        if (!await confirmAction('Remove work group?', 'Remove ' + group.name + ' and its ' + group.items.length + ' work items from this draft?')) return;
        state.groups = state.groups.filter(g => g.id !== group.id);state.dirty = true;render();
      } else if (button.dataset.deleteItem) {
        const item = group.items.find(i => i.id === button.dataset.deleteItem);if (!item) return;
        if (!await confirmAction('Remove work item?', 'Remove ' + item.name + ' from this draft?')) return;
        group.items = group.items.filter(i => i.id !== item.id);state.dirty = true;render();
      }
    });
    $('saveStructure').addEventListener('click', () => command('SAVE'));
    $('baselineStructure').addEventListener('click', async () => {
      if (state.dirty || $('baselineStructure').disabled) return;
      if (await confirmAction('Set project baseline?', 'Lock this saved scope and its 100% weight allocation. Future scope changes will require a new version and a revision reason.')) command('BASELINE');
    });
    $('reopenStructure').addEventListener('click', async () => {
      const result = await confirmAction('Revise project baseline', 'Create a new draft version while retaining the earlier baseline record.', true);
      if (result) command('REOPEN', result.reason);
    });
    window.addEventListener('beforeunload', event => {if (state.dirty) {event.preventDefault();event.returnValue = '';}});
  }
  async function init() {
    bindEvents();
    const {data, error} = await timed(supabaseClient.auth.getSession());
    if (error) throw error;
    if (!data?.session) {location.replace('admin.html');return;}
    supabaseClient.auth.onAuthStateChange(event => {if (event === 'SIGNED_OUT') location.replace('admin.html');});
    const result = await timed(supabaseClient.from('projects').select('project_id,project_name,project_type,location,status').in('project_type', M.types).order('project_name'));
    if (result.error) throw result.error;
    state.projects = result.data || [];
    $('structureProject').innerHTML = '<option value="">Select project…</option>' + state.projects.map(project => '<option value="' + esc(project.project_id) + '">' + esc(project.project_name + ' · ' + project.project_type) + '</option>').join('');
    $('structureProject').disabled = false;
    if (!state.projects.length) {
      empty('No eligible projects yet', 'Add a school building, multi-purpose building, covered court or water system in Project Master, then return here.');return;
    }
    const id = new URLSearchParams(location.search).get('project_id');
    if (id) {
      if (!state.projects.some(p => p.project_id === id)) {empty('Project is not available here', 'Choose one of the supported project types from the list.');return;}
      $('structureProject').value = id;await loadProject(id);
    }
  }
  document.addEventListener('DOMContentLoaded', () => init().catch(error => {
    empty('Project Structure could not be opened', 'Refresh this page or sign in again.');
    message(error.message || 'Unable to initialize Project Structure.', true);
  }));
})();
