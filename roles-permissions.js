const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let roles=[];
let permissions=[];
let users=[];
let editingRoleId=null;
let editingUserId=null;

function escapeHtml(value){
  if(value===null||value===undefined)return '';
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function showMessage(message,type='error'){
  const el=document.getElementById('rpMessage');
  el.textContent=message;
  el.className=`message ${type}`;
}
function clearMessage(){
  const el=document.getElementById('rpMessage');
  el.textContent='';
  el.className='message hidden';
}

async function ensureSuperAdmin(){
  const {data,error}=await supabaseClient.rpc('amanah_register_current_user');
  if(error)throw error;
  return data;
}

async function getAccess(){
  const {data:permissionRows,error:pError}=await supabaseClient.rpc('amanah_get_current_permissions');
  if(pError)throw pError;
  const {data:role,error:rError}=await supabaseClient.rpc('amanah_get_current_role');
  if(rError)throw rError;

  return {
    permissions:new Set((permissionRows||[]).map(row=>row.permission_key)),
    role:role||'UNASSIGNED'
  };
}

async function ensureAccess(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    location.href='admin.html';
    return false;
  }

  await ensureSuperAdmin();
  const access=await getAccess();
  document.getElementById('rpMyRole').textContent=access.role;

  if(!access.permissions.has('roles.manage')){
    document.querySelector('.rp-page').innerHTML=`
      <section class="rp-panel" style="padding:40px;text-align:center">
        <div class="rp-kicker">ACCESS RESTRICTED</div>
        <h2>ROLES &amp; PERMISSIONS</h2>
        <p style="color:#64748b">Your account does not have permission to manage system roles.</p>
        <button class="button primary" type="button" onclick="location.href='dashboard.html'">RETURN TO DASHBOARD</button>
      </section>`;
    return false;
  }
  return true;
}

function groupedPermissions(){
  const groups=new Map();
  permissions.forEach(p=>{
    if(!groups.has(p.module))groups.set(p.module,[]);
    groups.get(p.module).push(p);
  });
  return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function rolePermissionIds(roleId){
  const role=roles.find(r=>r.role_id===roleId);
  return new Set((role?.permission_ids||[]));
}

function renderRoleCards(){
  const host=document.getElementById('roleCards');
  if(!roles.length){
    host.innerHTML='<div class="rp-empty">No roles have been configured.</div>';
    return;
  }

  host.innerHTML=roles.map(role=>{
    const permissionCount=(role.permission_ids||[]).length;
    const system=role.is_system;
    return `
      <article class="rp-role-card ${system?'system':''}">
        <div class="rp-role-top">
          <div>
            <div class="rp-role-name">${escapeHtml(role.role_name)}</div>
            <div class="rp-role-description">${escapeHtml(role.description||'No description provided.')}</div>
          </div>
          ${system?'<span class="rp-role-badge">SYSTEM</span>':''}
        </div>
        <div class="rp-role-meta">
          <span class="rp-role-badge">${permissionCount} PERMISSIONS</span>
          <div class="rp-role-actions">
            <button class="rp-small-button primary" type="button" data-edit-role="${role.role_id}">EDIT</button>
            ${system?'':'<button class="rp-small-button danger" type="button" data-delete-role="'+role.role_id+'">DELETE</button>'}
          </div>
        </div>
      </article>`;
  }).join('');

  host.querySelectorAll('[data-edit-role]').forEach(btn=>
    btn.addEventListener('click',()=>openRoleModal(btn.dataset.editRole))
  );
  host.querySelectorAll('[data-delete-role]').forEach(btn=>
    btn.addEventListener('click',()=>deleteRole(btn.dataset.deleteRole))
  );
}

function renderPermissionGroups(selectedIds=new Set()){
  const host=document.getElementById('rolePermissionGroups');
  host.innerHTML=groupedPermissions().map(([module,items])=>`
    <div class="rp-permission-group">
      <div class="rp-permission-group-header">${escapeHtml(module)}</div>
      ${items.map(p=>`
        <label class="rp-permission-item">
          <input type="checkbox" value="${p.permission_id}" class="rp-permission-checkbox" ${selectedIds.has(p.permission_id)?'checked':''}>
          <span><strong>${escapeHtml(p.action)}</strong><span>${escapeHtml(p.description||p.permission_key)}</span></span>
        </label>`
      ).join('')}
    </div>`
  ).join('');

  document.getElementById('selectAllRolePermissions').checked=
    permissions.length>0 && [...document.querySelectorAll('.rp-permission-checkbox:checked')].length===permissions.length;
}

function openRoleModal(roleId=null){
  editingRoleId=roleId;
  const role=roleId?roles.find(r=>r.role_id===roleId):null;
  document.getElementById('roleModalTitle').textContent=role?'EDIT ROLE':'ADD ROLE';
  document.getElementById('roleName').value=role?.role_name||'';
  document.getElementById('roleDescription').value=role?.description||'';
  document.getElementById('roleName').disabled=!!role?.is_system;
  renderPermissionGroups(role?rolePermissionIds(roleId):new Set());
  document.getElementById('roleModal').classList.remove('hidden');
  document.getElementById('roleModal').setAttribute('aria-hidden','false');
}

function closeRoleModal(){
  document.getElementById('roleModal').classList.add('hidden');
  document.getElementById('roleModal').setAttribute('aria-hidden','true');
  editingRoleId=null;
}

async function saveRole(){
  clearMessage();
  const name=document.getElementById('roleName').value.trim();
  const description=document.getElementById('roleDescription').value.trim();
  const permissionIds=[...document.querySelectorAll('.rp-permission-checkbox:checked')].map(x=>x.value);

  if(!name){showMessage('Role name is required.','error');return;}
  if(!permissionIds.length){showMessage('Select at least one permission for the role.','error');return;}

  const save=document.getElementById('saveRoleButton');
  save.disabled=true;save.textContent='SAVING...';

  try{
    let roleId=editingRoleId;
    if(roleId){
      const {error}=await supabaseClient.from('amanah_roles').update({
        description,
        updated_at:new Date().toISOString()
      }).eq('role_id',roleId);
      if(error)throw error;
    }else{
      const {data,error}=await supabaseClient.from('amanah_roles').insert({
        role_name:name,
        description,
        is_system:false
      }).select('role_id').single();
      if(error)throw error;
      roleId=data.role_id;
    }

    const {error:deleteError}=await supabaseClient.from('amanah_role_permissions').delete().eq('role_id',roleId);
    if(deleteError)throw deleteError;

    const rows=permissionIds.map(permission_id=>({role_id:roleId,permission_id}));
    const {error:insertError}=await supabaseClient.from('amanah_role_permissions').insert(rows);
    if(insertError)throw insertError;

    closeRoleModal();
    showMessage('Role saved successfully.','success');
    await loadAll();
  }catch(error){
    showMessage(error.message||'Unable to save role.','error');
  }finally{
    save.disabled=false;save.textContent='SAVE ROLE';
  }
}

async function deleteRole(roleId){
  const role=roles.find(r=>r.role_id===roleId);
  if(!role||role.is_system)return;
  const confirmed=window.confirm(`Delete the role "${role.role_name}"? This action cannot be undone.`);
  if(!confirmed)return;

  const {error}=await supabaseClient.from('amanah_roles').delete().eq('role_id',roleId);
  if(error){showMessage(error.message||'Unable to delete role.','error');return;}
  showMessage('Role deleted successfully.','success');
  await loadAll();
}

async function openUserRoleModal(userId){
  const user=users.find(x=>x.auth_user_id===userId);
  if(!user)return;

  editingUserId=userId;
  document.getElementById('selectedUserSummary').innerHTML=`
    <strong>${escapeHtml(user.display_name||'AMANAH USER')}</strong>
    <span>${escapeHtml(user.email)}</span>`;

  document.getElementById('userRoleSelect').innerHTML=
    roles.map(role=>`<option value="${role.role_id}">${escapeHtml(role.role_name)}</option>`).join('');

  const current=user.role_ids?.[0];
  if(current)document.getElementById('userRoleSelect').value=current;

  document.getElementById('userRoleModal').classList.remove('hidden');
  document.getElementById('userRoleModal').setAttribute('aria-hidden','false');
}

function closeUserRoleModal(){
  document.getElementById('userRoleModal').classList.add('hidden');
  document.getElementById('userRoleModal').setAttribute('aria-hidden','true');
  editingUserId=null;
}

async function saveUserRole(){
  if(!editingUserId)return;
  const roleId=document.getElementById('userRoleSelect').value;
  if(!roleId){showMessage('Please select a role.','error');return;}

  const save=document.getElementById('saveUserRoleButton');
  save.disabled=true;save.textContent='SAVING...';

  try{
    await supabaseClient.from('amanah_user_roles').delete().eq('auth_user_id',editingUserId);
    const {error}=await supabaseClient.from('amanah_user_roles').insert({
      auth_user_id:editingUserId,
      role_id:roleId
    });
    if(error)throw error;
    closeUserRoleModal();
    showMessage('User role updated successfully.','success');
    await loadUsers();
  }catch(error){
    showMessage(error.message||'Unable to update user role.','error');
  }finally{
    save.disabled=false;save.textContent='ASSIGN ROLE';
  }
}

async function loadRoles(){
  const [{data:roleRows,error:roleError},{data:permissionRows,error:permissionError},{data:rpRows,error:rpError}]=await Promise.all([
    supabaseClient.from('amanah_roles').select('role_id,role_name,description,is_system,created_at').order('role_name'),
    supabaseClient.from('amanah_permissions').select('permission_id,permission_key,module,action,description').order('module').order('action'),
    supabaseClient.from('amanah_role_permissions').select('role_id,permission_id')
  ]);
  if(roleError)throw roleError;if(permissionError)throw permissionError;if(rpError)throw rpError;

  permissions=permissionRows||[];
  const permissionMap=new Map();
  (rpRows||[]).forEach(row=>{
    if(!permissionMap.has(row.role_id))permissionMap.set(row.role_id,[]);
    permissionMap.get(row.role_id).push(row.permission_id);
  });
  roles=(roleRows||[]).map(role=>({...role,permission_ids:permissionMap.get(role.role_id)||[]}));

  document.getElementById('rpRoleCount').textContent=roles.length;
  document.getElementById('rpPermissionCount').textContent=permissions.length;
  renderRoleCards();
}

async function loadUsers(){
  const {data:userRows,error:userError}=await supabaseClient
    .from('amanah_user_directory')
    .select('auth_user_id,email,display_name,active,last_seen_at,created_at')
    .order('display_name');

  if(userError)throw userError;

  const {data:userRoleRows,error:urError}=await supabaseClient
    .from('amanah_user_roles')
    .select('auth_user_id,role_id');

  if(urError)throw urError;

  users=(userRows||[]).map(user=>({
    ...user,
    role_ids:(userRoleRows||[]).filter(row=>row.auth_user_id===user.auth_user_id).map(row=>row.role_id)
  }));

  document.getElementById('rpUserCount').textContent=users.length;
  const body=document.getElementById('rpUsersBody');

  if(!users.length){
    body.innerHTML='<tr><td colspan="5" class="rp-empty">No registered users found.</td></tr>';
    return;
  }

  body.innerHTML=users.map(user=>{
    const roleNames=(user.role_ids||[]).map(id=>roles.find(r=>r.role_id===id)?.role_name).filter(Boolean);
    return `<tr>
      <td><span class="rp-user-name">${escapeHtml(user.display_name||'AMANAH USER')}</span><span class="rp-user-sub">${escapeHtml(user.auth_user_id)}</span></td>
      <td>${escapeHtml(user.email)}</td>
      <td>${roleNames.length?roleNames.map(name=>`<span class="rp-role-chip">${escapeHtml(name)}</span>`).join(''):'<span class="rp-role-badge">UNASSIGNED</span>'}</td>
      <td><span class="rp-status-chip">${user.active?'ACTIVE':'INACTIVE'}</span></td>
      <td><button class="rp-small-button primary" type="button" data-assign-user="${user.auth_user_id}">ASSIGN ROLE</button></td>
    </tr>`;
  }).join('');

  body.querySelectorAll('[data-assign-user]').forEach(btn=>
    btn.addEventListener('click',()=>openUserRoleModal(btn.dataset.assignUser))
  );
}

async function loadAll(){
  await Promise.all([loadRoles(),loadUsers()]);
}

document.addEventListener('DOMContentLoaded',async()=>{
  try{
    if(!(await ensureAccess()))return;
    await loadAll();

    document.getElementById('addRoleButton').addEventListener('click',()=>openRoleModal());
    document.getElementById('closeRoleModal').addEventListener('click',closeRoleModal);
    document.getElementById('cancelRoleButton').addEventListener('click',closeRoleModal);
    document.getElementById('saveRoleButton').addEventListener('click',saveRole);
    document.getElementById('closeUserRoleModal').addEventListener('click',closeUserRoleModal);
    document.getElementById('cancelUserRoleButton').addEventListener('click',closeUserRoleModal);
    document.getElementById('saveUserRoleButton').addEventListener('click',saveUserRole);
    document.getElementById('refreshUsersButton').addEventListener('click',loadUsers);

    document.getElementById('selectAllRolePermissions').addEventListener('change',event=>{
      document.querySelectorAll('.rp-permission-checkbox').forEach(box=>box.checked=event.target.checked);
    });

    document.getElementById('roleModal').addEventListener('click',event=>{
      if(event.target.id==='roleModal')closeRoleModal();
    });
    document.getElementById('userRoleModal').addEventListener('click',event=>{
      if(event.target.id==='userRoleModal')closeUserRoleModal();
    });
  }catch(error){
    console.error(error);
    showMessage(error.message||'Unable to initialize Roles & Permissions.','error');
  }
});