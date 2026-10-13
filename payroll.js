const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let payrollEmployees=[];
let payrollAttendance=[];
let payrollRows=[];
let calculatedPeriod=null;
let payrollEmployeeOptions=[];
let groupLaborRows=[];
let payrollProjects=[];
let payrollSaved=false;
let payrollSaving=false;
let activePaycheckRun=null;
let activePaycheckEntries=[];
let activePaycheckClaims=[];
let pendingClaimEntry=null;
let paycheckClaimBusy=false;
let paycheckReleaseAwaitingConfirmation=false;

async function loadGroupLaborProjects(){
  const select=document.getElementById('groupLaborProject');
  if(!select)return;

  const original=select.value;
  select.disabled=true;
  select.innerHTML='<option value="">Loading projects...</option>';

  try{
    const {data,error}=await supabaseClient.from('projects')
      .select('project_id,project_name,status')
      .order('project_name');

    if(error)throw error;

    payrollProjects=(data||[]).filter(p=>
      String(p.status||'').toUpperCase()==='ACTIVE'
    );

    select.innerHTML='<option value="">Select project</option>'+
      payrollProjects.map(p=>
        '<option value="'+escapeHtml(p.project_id)+'">'+
        escapeHtml(p.project_name||p.project_id)+' — '+
        escapeHtml(p.project_id)+'</option>'
      ).join('');

    if(payrollProjects.some(p=>p.project_id===original))select.value=original;
    if(!payrollProjects.length){
      select.innerHTML='<option value="">No active projects available</option>';
    }
  }catch(error){
    select.innerHTML='<option value="">Unable to load projects</option>';
    throw error;
  }finally{
    select.disabled=false;
  }
}




function groupLaborGross(row){
  return num(row.ratePerMeter)*num(row.metersAccomplished);
}

function updateGroupLaborPreview(){
  const rate=num(document.getElementById('groupLaborRate')?.value);
  const meters=num(document.getElementById('groupLaborMeters')?.value);
  const gross=rate*meters;
  const el=document.getElementById('groupLaborPreviewGross');
  if(el)el.textContent=money(gross);
}

async function openGroupLaborModal(){
  clearMessage();
  if(payrollSaved){
    showMessage('This payroll run is already saved. Calculate a new payroll before adding more group labor.','error');
    return;
  }
  document.getElementById('groupLaborProject').value='';
  document.getElementById('groupLaborName').value='';
  document.getElementById('groupLaborActivity').value='';
  document.getElementById('groupLaborRate').value='';
  document.getElementById('groupLaborMeters').value='';
  document.getElementById('groupLaborError').textContent='';
  updateGroupLaborPreview();

  const modal=document.getElementById('groupLaborModal');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
  try{
    await loadGroupLaborProjects();
  }catch(error){
    document.getElementById('groupLaborError').textContent=
      'Projects could not be loaded: '+(error.message||'Please retry.');
  }
}

function closeGroupLaborModal(){
  const modal=document.getElementById('groupLaborModal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');
}

function addGroupLaborEntry(){
  const error=document.getElementById('groupLaborError');
  error.textContent='';

  const projectId=document.getElementById('groupLaborProject').value;
  const project=payrollProjects.find(p=>p.project_id===projectId);
  const groupName=document.getElementById('groupLaborName').value.trim();
  const activity=document.getElementById('groupLaborActivity').value.trim();
  const rate=num(document.getElementById('groupLaborRate').value);
  const meters=num(document.getElementById('groupLaborMeters').value);

  const start=document.getElementById('payrollStart').value;
  const end=document.getElementById('payrollEnd').value;

  if(!start||!end||end<start){
    error.textContent='Please set a valid payroll period first.';
    return;
  }
  if(!project){
    error.textContent='Please select the project where this group labor expense belongs.';
    return;
  }
  if(!groupName){
    error.textContent='Please enter the group name.';
    return;
  }
  if(!activity){
    error.textContent='Please enter the activity or description.';
    return;
  }
  if(rate<=0){
    error.textContent='Please enter a rate per meter greater than 0.';
    return;
  }
  if(meters<=0){
    error.textContent='Please enter meters accomplished greater than 0.';
    return;
  }

  groupLaborRows.push({
    projectId:project.project_id,
    projectName:project.project_name||project.project_id,
    groupName,
    activity,
    ratePerMeter:rate,
    metersAccomplished:meters
  });

  calculatedPeriod={
    start,
    end,
    employeeId:selectedPayrollEmployeeId(),
    includesManualEntries:payrollRows.some(r=>r.source==='MANUAL'),
    includesGroupLabor:true
  };

  renderGroupLabor();
  updateSummary();
  closeGroupLaborModal();

  showMessage(
    groupName+' group labor was added: '+meters.toLocaleString('en-PH',{maximumFractionDigits:2})+
    ' meters × '+money(rate)+'.',
    'success'
  );
}

function renderGroupLabor(){
  const body=document.getElementById('groupLaborBody');
  if(!body)return;

  if(!groupLaborRows.length){
    body.innerHTML='<tr><td colspan="6" class="payroll-empty">No group labor entries added.</td></tr>';
    document.getElementById('groupLaborGross').textContent=money(0);
    return;
  }

  body.innerHTML=groupLaborRows.map((row,index)=>`
    <tr>
      <td><strong>${escapeHtml(row.groupName)}</strong></td>
      <td><strong>${escapeHtml(row.projectName||row.projectId)}</strong><span class="payroll-sub">${escapeHtml(row.projectId||'')}</span></td>
      <td>${escapeHtml(row.activity)}</td>
      <td class="payroll-rate">${money(row.ratePerMeter)}<span class="payroll-sub">PER METER</span></td>
      <td>${num(row.metersAccomplished).toFixed(2)}</td>
      <td class="payroll-gross">
        ${money(groupLaborGross(row))}
        ${payrollSaved?'':'<button type="button" class="group-labor-remove" data-group-index="'+index+'">REMOVE</button>'}
      </td>
    </tr>`).join('');

  body.querySelectorAll('[data-group-index]').forEach(button=>{
    button.addEventListener('click',()=>{
      groupLaborRows.splice(Number(button.dataset.groupIndex),1);
      renderGroupLabor();
      updateSummary();
    });
  });

  const gross=groupLaborRows.reduce((sum,row)=>sum+groupLaborGross(row),0);
  document.getElementById('groupLaborGross').textContent=money(gross);
}

function manualPayrollEmployee(){
  const raw=String(
    document.getElementById('manualPayrollEmployee')?.value||''
  ).trim();

  if(!raw)return null;

  const normalized=raw.toUpperCase();

  return payrollEmployees.find(employee=>{
    const id=String(employee.employee_id||'').trim().toUpperCase();
    const name=String(employee.employee_name||'').trim().toUpperCase();
    const display=(name+' — '+id).toUpperCase();

    return normalized===display ||
      normalized===id ||
      normalized===name;
  })||null;
}

function manualPayrollIsHourly(employee){
  /*
   * AMANAH drivers/operators are paid on a DAILY basis.
   * Treat employees whose position identifies them as DRIVER/OPERATOR,
   * and employees in the TRUCKERS department, as daily-rate employees.
   * Keep the function name for compatibility with the existing UI logic.
   */
  const position=String(employee?.position||'').trim().toUpperCase();
  const department=normalizeDepartment(employee?.department);

  const isDriverOperator=
    position.includes('DRIVER') ||
    position.includes('OPERATOR') ||
    department==='TRUCKERS';

  return !isDriverOperator;
}

function manualPayrollRate(employee){
  if(!employee)return 0;
  return manualPayrollIsHourly(employee) ? num(employee.hourly_rate) : num(employee.daily_rate);
}

function updateManualPayrollPreview(){
  const employee=manualPayrollEmployee();
  const department=document.getElementById('manualPayrollDepartment');
  const basis=document.getElementById('manualPayrollBasis');
  const rate=document.getElementById('manualPayrollRate');
  const dailyPanel=document.getElementById('manualDailyFields');
  const hourlyPanel=document.getElementById('manualHourlyFields');

  if(!employee){
    department.textContent='—';
    basis.textContent='—';
    rate.textContent='₱0.00';
    dailyPanel.hidden=true;
    hourlyPanel.hidden=true;
    return;
  }

  const hourly=manualPayrollIsHourly(employee);
  const employeeRate=manualPayrollRate(employee);

  department.textContent=employee.department||'—';
  basis.textContent=hourly?'HOURLY':'DAILY';
  rate.textContent=money(employeeRate);
  dailyPanel.hidden=hourly;
  hourlyPanel.hidden=!hourly;

  const full=num(document.getElementById('manualFullDays').value);
  const half=num(document.getElementById('manualHalfDays').value);
  const hours=num(document.getElementById('manualHours').value);

  document.getElementById('manualDailyGross').textContent =
    money((full*employeeRate)+(half*(employeeRate/2)));

  document.getElementById('manualHourlyGross').textContent =
    money(hours*employeeRate);
}

function populateManualPayrollEmployees(){
  const input=document.getElementById('manualPayrollEmployee');
  const list=document.getElementById('manualPayrollEmployeeList');
  if(!input||!list)return;

  const employees=[...(payrollEmployees||[])]
    .filter(e=>String(e.status||'').toUpperCase()==='ACTIVE')
    .sort((a,b)=>
      String(a.employee_name||'').localeCompare(
        String(b.employee_name||'')
      )
    );

  list.innerHTML=employees.map(e=>{
    const name=String(e.employee_name||'').trim();
    const id=String(e.employee_id||'').trim();
    return '<option value="'+escapeHtml(name+' — '+id)+'"></option>';
  }).join('');

  input.value='';
  updateManualPayrollPreview();
}
function openManualPayrollModal(){
  clearMessage();
  populateManualPayrollEmployees();
  document.getElementById('manualPayrollEmployee').value='';
  document.getElementById('manualFullDays').value='0';
  document.getElementById('manualHalfDays').value='0';
  document.getElementById('manualHours').value='0';
  document.getElementById('manualPayrollError').textContent='';
  updateManualPayrollPreview();

  const modal=document.getElementById('manualPayrollModal');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
}

function closeManualPayrollModal(){
  const modal=document.getElementById('manualPayrollModal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');
}

function addManualPayrollEntry(){
  const error=document.getElementById('manualPayrollError');
  error.textContent='';
  if(payrollSaved){
    error.textContent='Calculate a new payroll before adding entries to a saved run.';
    return;
  }

  const employee=manualPayrollEmployee();
  if(!employee){
    error.textContent='Please select an employee.';
    return;
  }

  const start=document.getElementById('payrollStart').value;
  const end=document.getElementById('payrollEnd').value;
  if(!start||!end||end<start){
    error.textContent='Please set a valid payroll period first.';
    return;
  }

  const duplicate=payrollRows.some(row=>String(row.employeeId)===String(employee.employee_id));
  if(duplicate){
    error.textContent='This employee is already included in the current payroll register.';
    return;
  }

  const rate=manualPayrollRate(employee);
  if(rate<=0){
    error.textContent='This employee does not have a valid daily payroll rate in Employee Master.';
    return;
  }

  const fullDays=Math.max(0,num(document.getElementById('manualFullDays').value));
  const halfDays=Math.max(0,num(document.getElementById('manualHalfDays').value));

  if(fullDays<=0 && halfDays<=0){
    error.textContent='Please enter at least one full day or half day.';
    return;
  }

  if(fullDays+halfDays>31){
    error.textContent='The total classified days cannot exceed 31.';
    return;
  }

  const row={
    employeeId:employee.employee_id,
    employeeName:employee.employee_name||'—',
    department:employee.department||'—',
    rateType:'DAILY',
    rate,
    attendanceDays:fullDays+halfDays,
    fullDays,
    halfDays,
    hours:0,
    attendanceIds:[],
    source:'MANUAL'
  };

  payrollRows.push(row);

  calculatedPeriod={
    start,
    end,
    employeeId:'',
    includesManualEntries:true
  };

  render();
  closeManualPayrollModal();

  showMessage(
    row.employeeName+' was added to the payroll register manually.',
    'success'
  );
}
function escapeHtml(v){return v==null?'':String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");}
function money(v){return '₱'+Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function dateText(v){return v?String(v).slice(0,10):'—';}
function showMessage(message,type='error'){const el=document.getElementById('payrollMessage');el.textContent=message;el.className=`message ${type}`;}
function clearMessage(){const el=document.getElementById('payrollMessage');el.textContent='';el.className='message hidden';}

async function requireSession(){
  const {data,error}=await supabaseClient.auth.getSession();
  if(error)throw error;
  if(!data?.session){location.href='admin.html';return false;}
  return true;
}

function normalizeDepartment(v){return String(v||'').trim().toUpperCase();}

function selectedPayrollEmployeeId(){
  return String(
    document.getElementById('payrollEmployeeFilter')?.value || ''
  );
}

function populatePayrollEmployeeFilter(employees){
  const select=document.getElementById('payrollEmployeeFilter');
  if(!select)return;

  const selected=select.value;
  const sorted=[...(employees||[])].sort((a,b)=>
    String(a.employee_name||'').localeCompare(String(b.employee_name||''))
  );

  payrollEmployeeOptions=sorted;
  select.innerHTML='<option value="">ALL EMPLOYEES</option>'+
    sorted.map(employee=>
      `<option value="${escapeHtml(employee.employee_id)}">${escapeHtml(employee.employee_name||'—')} — ${escapeHtml(employee.employee_id||'') }</option>`
    ).join('');

  if(sorted.some(employee=>String(employee.employee_id)===selected)){
    select.value=selected;
  }else{
    select.value='';
  }
}

function completedInPeriod(row,start,end){
  const status=String(row.status||'').toUpperCase();
  if(status!=='COMPLETED')return false;
  const d=String(row.attendance_date||'').slice(0,10);
  return d>=start&&d<=end;
}

function buildPayrollRows(){
  const byEmployee=new Map();

  payrollEmployees
    .filter(employee=>{
      const selected=selectedPayrollEmployeeId();
      return !selected || String(employee.employee_id)===selected;
    })
    .forEach(employee=>{
    byEmployee.set(employee.employee_id,{
      employeeId:employee.employee_id,
      employeeName:employee.employee_name||'—',
      department:employee.department||'—',
      rateType:'DAILY',
      rate:num(employee.daily_rate),
      attendanceDays:0,
      fullDays:0,
      halfDays:0,
      hours:0,
      attendanceIds:[]
    });
  });

  payrollAttendance.forEach(row=>{
    const id=String(row.employee_id||'');
    const item=byEmployee.get(id);
    if(!item)return;
    item.attendanceIds.push(row.attendance_id);
    item.attendanceDays+=1;
    item.hours+=num(row.total_hours);
  });

  payrollRows=[...byEmployee.values()].filter(r=>r.attendanceDays>0||r.hours>0);
  payrollRows.forEach(r=>{
    if(r.rateType==='DAILY'){
      r.fullDays=r.attendanceDays;
      r.halfDays=0;
    }
  });
}

function grossFor(row){
  return (row.fullDays*row.rate)+(row.halfDays*(row.rate/2));
}

function render(){
  const body=document.getElementById('payrollBody');

  if(!payrollRows.length){
    body.innerHTML='<tr><td colspan="9" class="payroll-empty">No completed attendance records were found for the selected period.</td></tr>';
    updateSummary();
    return;
  }

  body.innerHTML=payrollRows.map((row,index)=>{
    const daily=row.rateType==='DAILY';
    return `<tr>
      <td><strong>${escapeHtml(row.employeeName)}</strong><span class="payroll-sub">${escapeHtml(row.employeeId)}</span></td>
      <td>${escapeHtml(row.department)}</td>
      <td>${daily?'DAILY':'HOURLY'}</td>
      <td class="payroll-rate">${money(row.rate)}<span class="payroll-sub">${daily?'PER DAY':'PER HOUR'}</span></td>
      <td>${daily?row.attendanceDays:'—'}</td>
      <td>${daily?'<input class="payroll-input" type="text" inputmode="decimal" data-index="'+index+'" data-field="fullDays" value="'+row.fullDays.toFixed(2)+'">':'—'}</td>
      <td>${daily?'<input class="payroll-input" type="text" inputmode="decimal" data-index="'+index+'" data-field="halfDays" value="'+row.halfDays.toFixed(2)+'">':'—'}</td>
      <td>${row.hours.toFixed(2)}</td>
      <td class="payroll-gross" data-gross-index="${index}">${money(grossFor(row))}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.payroll-input').forEach(input=>{
    input.addEventListener('input',()=>{
      const row=payrollRows[Number(input.dataset.index)];
      const value=Math.max(0,num(input.value));
      const field=input.dataset.field;
      if(field==='fullDays')row.fullDays=value;
      if(field==='halfDays')row.halfDays=value;

      const totalClassified=row.fullDays+row.halfDays;
      if(totalClassified>row.attendanceDays){
        if(field==='fullDays')row.fullDays=Math.max(0,row.attendanceDays-row.halfDays);
        else row.halfDays=Math.max(0,row.attendanceDays-row.fullDays);
        input.value=row[field].toFixed(2);
      }

      const grossCell=document.querySelector('[data-gross-index="'+input.dataset.index+'"]');
      if(grossCell)grossCell.textContent=money(grossFor(row));
      updateSummary();
    });
  });

  updateSummary();
}

function updatePrintHeader(){
  const start=document.getElementById('payrollStart')?.value || '—';
  const end=document.getElementById('payrollEnd')?.value || '—';
  const employeeSelect=document.getElementById('payrollEmployeeFilter');
  const employeeText=employeeSelect?.value
    ? (employeeSelect.options[employeeSelect.selectedIndex]?.textContent || '—')
    : 'ALL EMPLOYEES';

  const generated=new Date().toLocaleString([],{
    year:'numeric',
    month:'short',
    day:'numeric',
    hour:'numeric',
    minute:'2-digit'
  });

  const periodEl=document.getElementById('printPayrollPeriod');
  const employeeEl=document.getElementById('printPayrollEmployee');
  const generatedEl=document.getElementById('printPayrollGenerated');

  if(periodEl)periodEl.textContent=`${dateText(start)} – ${dateText(end)}`;
  if(employeeEl)employeeEl.textContent=employeeText;
  if(generatedEl)generatedEl.textContent=generated;
}

function printPayroll(){
  if(!calculatedPeriod || (!payrollRows.length&&!groupLaborRows.length)){
    showMessage('Please calculate the payroll before printing.','error');
    return;
  }

  updatePrintHeader();
  document.title='AMANAH Payroll Register';
  window.print();
}

function updateSummary(){
  const employees=payrollRows.length;
  const workDays=payrollRows.reduce((sum,r)=>sum+(r.rateType==='DAILY'?r.fullDays+r.halfDays:0),0);
  const truckerHours=payrollRows.reduce((sum,r)=>sum+(r.rateType==='HOURLY'?r.hours:0),0);
  const employeeGross=payrollRows.reduce((sum,r)=>sum+grossFor(r),0);
  const groupGross=groupLaborRows.reduce((sum,r)=>sum+groupLaborGross(r),0);
  const gross=employeeGross+groupGross;


  document.getElementById('payrollEmployeeCount').textContent=employees;
  document.getElementById('payrollWorkDays').textContent=workDays.toFixed(2);
  document.getElementById('payrollTruckerHours').textContent=truckerHours.toFixed(2);
  document.getElementById('payrollGross').textContent=money(gross);
  const hasPayrollRows=payrollRows.length||groupLaborRows.length;
  document.getElementById('savePayrollButton').disabled=!hasPayrollRows||!calculatedPeriod||payrollSaved||payrollSaving;
  document.getElementById('printPayrollButton').disabled=!hasPayrollRows||!calculatedPeriod;

}

async function calculatePayroll(){
  clearMessage();
  if(!(await requireSession()))return;

  const start=document.getElementById('payrollStart').value;
  const end=document.getElementById('payrollEnd').value;
  if(!start||!end){showMessage('Please select both the payroll start date and end date.','error');return;}
  if(end<start){showMessage('Payroll end date cannot be earlier than the start date.','error');return;}

  // Start a fresh register after the previous payroll was successfully saved.
  // Never silently carry previously posted group labor into another payroll.
  if(payrollSaved){
    groupLaborRows=[];
    payrollSaved=false;
    renderGroupLabor();
  }

  const [{data:employees,error:empError},{data:attendance,error:attError}]=await Promise.all([
    supabaseClient.from('employees').select('employee_id,employee_name,department,hourly_rate,daily_rate,status').eq('status','ACTIVE').order('employee_name'),
    supabaseClient.from('attendance').select('attendance_id,employee_id,attendance_date,status,total_hours').eq('status','COMPLETED').gte('attendance_date',start).lte('attendance_date',end).order('attendance_date')
  ]);

  if(empError)throw empError;
  if(attError)throw attError;

  payrollEmployees=employees||[];
  populatePayrollEmployeeFilter(payrollEmployees);

  const selectedEmployeeId=selectedPayrollEmployeeId();

  payrollAttendance=(attendance||[])
    .filter(row=>
      !selectedEmployeeId ||
      String(row.employee_id)===selectedEmployeeId
    );

  calculatedPeriod={
    start,
    end,
    employeeId:selectedEmployeeId
  };
  buildPayrollRows();
  render();
  showMessage('Payroll calculated successfully. Review the daily employee classifications before saving.','success');
}

async function savePayroll(){
 clearMessage();
 if(payrollSaving)return;
 if(payrollSaved){
   showMessage('This payroll was already submitted. Calculate a new payroll before saving another run.','error');
   return;
 }
 if(!calculatedPeriod||(!payrollRows.length&&!groupLaborRows.length)){
   showMessage('Add employee payroll or group labor before saving.','error');return;
 }
 if(groupLaborRows.some(row=>!row.projectId||!payrollProjects.some(p=>p.project_id===row.projectId))){
   showMessage('Select a valid project for every Group Labor entry.','error');
   return;
 }
 const button=document.getElementById('savePayrollButton');
 payrollSaving=true;
 button.disabled=true;
 button.textContent='SAVING & SUBMITTING...';
 try{
   const items=payrollRows.map(row=>({
     employee_id:row.employeeId,
     employee_name:row.employeeName,
     department:row.department,
     rate_type:row.rateType,
     rate:Number(row.rate.toFixed(2)),
     attendance_days:Number(row.attendanceDays.toFixed(2)),
     full_days:Number(row.fullDays.toFixed(2)),
     half_days:Number(row.halfDays.toFixed(2)),
     total_hours:Number(row.hours.toFixed(2)),
     gross_pay:Number(grossFor(row).toFixed(2)),
     attendance_ids:row.attendanceIds||[]
   }));
   const groups=groupLaborRows.map(row=>({
     project_id:row.projectId,
     group_name:row.groupName,
     activity_description:row.activity,
     rate_per_meter:Number(row.ratePerMeter.toFixed(2)),
     meters_accomplished:Number(row.metersAccomplished.toFixed(2)),
     gross_pay:Number(groupLaborGross(row).toFixed(2))
   }));
   // A single PostgreSQL transaction persists the run AND every payroll line.
   // An insert, validation or submission failure rolls back EVERYTHING.
   const {data:runId,error}=await supabaseClient.rpc('amanah_payroll_create_and_submit',{
     p_period_start:calculatedPeriod.start,
     p_period_end:calculatedPeriod.end,
     p_employee_items:items,
     p_group_items:groups
   });
   if(error)throw error;
   if(!runId)throw new Error('No payroll reference returned from the server.');
   payrollSaved=true;
   renderGroupLabor();
   showMessage('Payroll successfully saved and SENT FOR APPROVAL. View the pending request in the Financial Manager Payroll Approval Center.','success');
   await loadPayrollHistory().catch(e=>console.error('Payroll submitted, but history refresh failed:',e));
 }catch(error){
   // Atomic operation: no new Draft header is left behind when saving fails.
   showMessage('Payroll was NOT submitted. '+(error.message||'Please review the entries and try again.'),'error');
 }finally{
   payrollSaving=false;
   button.textContent=payrollSaved?'SENT FOR APPROVAL':'SAVE PAYROLL';
   updateSummary();
 }
}

async function loadPayrollHistory(){
 const body=document.getElementById('payrollHistoryBody');
 const [runsResponse,employeeResponse,groupResponse]=await Promise.all([
   supabaseClient.from('payroll_runs')
     .select('payroll_run_id,period_start,period_end,status,total_gross,employee_count,created_at,review_notes,submitted_at')
     .order('created_at',{ascending:false}).limit(50),
   supabaseClient.from('payroll_items').select('payroll_run_id,gross_pay'),
   supabaseClient.from('payroll_group_items').select('payroll_run_id,gross_pay')
 ]);
 const {data,error}=runsResponse;
 if(error||employeeResponse.error||groupResponse.error){
   showMessage('Unable to verify saved payroll entries: '+(error||employeeResponse.error||groupResponse.error).message,'error');
   body.innerHTML='<tr><td colspan="6" class="payroll-empty">Unable to load payroll history.</td></tr>';
   return;
 }
 if(!data?.length){
   body.innerHTML='<tr><td colspan="6" class="payroll-empty">No payroll runs found.</td></tr>';
   return;
 }
 const recorded=new Map();
 const addRows=(rows,employee)=>{for(const line of rows||[]){
   const entry=recorded.get(line.payroll_run_id)||{employeeCount:0,total:0,lineCount:0};
   entry.total+=Number(line.gross_pay)||0;
   entry.lineCount++;
   if(employee)entry.employeeCount++;
   recorded.set(line.payroll_run_id,entry);
 }};
 addRows(employeeResponse.data,true);
 addRows(groupResponse.data,false);
 const {data:canManage}=await supabaseClient.rpc('amanah_payroll_can_prepare');
 body.innerHTML=data.map(run=>{
   const created=run.created_at?new Date(run.created_at).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';
   const status=String(run.status||'DRAFT');
   const lines=recorded.get(run.payroll_run_id)||{employeeCount:0,total:0,lineCount:0};
   const complete=lines.lineCount>0&&lines.total>0&&
       lines.employeeCount===Number(run.employee_count)&&
       Math.abs(lines.total-Number(run.total_gross))<=0.011;
   const displayStatus=status==='DRAFT'&&!complete?'INCOMPLETE DRAFT':status.replaceAll('_',' ');
   const cls=status==='DRAFT'&&!complete?'incomplete':status.toLowerCase();
   let action='';
   if(status==='DRAFT'&&!complete){
     action='<span class="payroll-sub">Missing payroll entries. Recalculate and save a NEW payroll.</span>';
   } else if(status==='DRAFT'&&canManage){
     action='<button class="button secondary payroll-history-action" type="button" data-payroll-submit="'+escapeHtml(run.payroll_run_id)+'">SEND FOR APPROVAL</button>';
   } else if(status==='APPROVED'){
     action='<button class="button primary payroll-history-action" type="button" data-payroll-open="'+escapeHtml(run.payroll_run_id)+'">VIEW PAYCHECKS</button>';
   } else if(status==='REJECTED'){
     action='<span class="payroll-sub">Prepare a corrected new run</span>';
   } else if(status==='PENDING_APPROVAL'){
     action='<span class="payroll-sub">Waiting for Financial Manager</span>';
   }
   return `<tr>
     <td><strong>${escapeHtml(dateText(run.period_start))}</strong> – ${escapeHtml(dateText(run.period_end))}</td>
     <td>${escapeHtml(run.employee_count)}</td>
     <td class="payroll-gross">${money(run.total_gross)}</td>
     <td><span class="payroll-status ${cls}">${escapeHtml(displayStatus)}</span>${run.review_notes?'<small class="payroll-sub">Finance: '+escapeHtml(run.review_notes)+'</small>':''}</td>
     <td>${escapeHtml(created)}</td>
     <td>${action}</td>
   </tr>`;
 }).join('');
}

async function submitHistoricalPayroll(runId){
 const button=document.querySelector('[data-payroll-submit="'+CSS.escape(runId)+'"]');
 if(button)button.disabled=true;
 try{
   const {error}=await supabaseClient.rpc('amanah_payroll_submit',{p_run_id:runId});
   if(error)throw error;
   showMessage('Draft payroll submitted successfully. Await Financial Manager approval before releasing paychecks.','success');
   await loadPayrollHistory();
 }catch(error){
   showMessage(error.message||'Unable to submit saved Draft payroll.','error');
   if(button)button.disabled=false;
 }
}

function closePaycheckPanel(){
 activePaycheckRun=null;
 activePaycheckEntries=[];
 activePaycheckClaims=[];
 document.getElementById('paycheckReleasePanel').hidden=true;
}
async function openPaycheckPanel(runId){
 const runResp=await supabaseClient.from('payroll_runs')
   .select('payroll_run_id,period_start,period_end,status,total_gross')
   .eq('payroll_run_id',runId).single();
 if(runResp.error)throw runResp.error;
 if(runResp.data.status!=='APPROVED'){
   throw new Error('Paycheck release is unavailable. Only Financial Manager-approved payroll may be claimed.');
 }
 activePaycheckRun=runResp.data;
 document.getElementById('paycheckReleasePanel').hidden=false;
 document.getElementById('paycheckReleaseTitle').textContent=
   'PAYCHECK CLAIM REGISTER • '+dateText(runResp.data.period_start)+' – '+dateText(runResp.data.period_end);
 await reloadPaycheckPanel();
 document.getElementById('paycheckReleasePanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function reloadPaycheckPanel(){
 if(!activePaycheckRun)return;
 const id=activePaycheckRun.payroll_run_id;
 const [employees,groups,claims,access]=await Promise.all([
   supabaseClient.from('payroll_items')
     .select('payroll_item_id,payroll_run_id,employee_name,gross_pay').eq('payroll_run_id',id),
   supabaseClient.from('payroll_group_items')
     .select('payroll_group_item_id,payroll_run_id,group_name,project_id,gross_pay').eq('payroll_run_id',id),
   supabaseClient.from('payroll_paycheck_claims')
     .select('payroll_item_id,payroll_group_item_id,recipient_name,amount,released_on,payment_method,payment_reference,acknowledgment,created_at').eq('payroll_run_id',id),
   supabaseClient.rpc('amanah_payroll_can_release')
 ]);
 for(const r of [employees,groups,claims,access])if(r.error)throw r.error;
 const canRelease=access.data===true;
 activePaycheckEntries=[
   ...(employees.data||[]).map(e=>({kind:'EMPLOYEE',itemId:e.payroll_item_id,name:e.employee_name,amount:e.gross_pay})),
   ...(groups.data||[]).map(g=>({kind:'GROUP',itemId:g.payroll_group_item_id,name:g.group_name,projectId:g.project_id,amount:g.gross_pay}))
 ];
 activePaycheckClaims=claims.data||[];
 const claimed=activePaycheckClaims.length,total=activePaycheckEntries.length;
 const totalPaid=activePaycheckClaims.reduce((s,c)=>s+Number(c.amount||0),0);
 document.getElementById('paycheckReleaseStatus').textContent=
   'APPROVED FOR CLAIM • '+claimed+' of '+total+' payments released • Paid '+money(totalPaid)+
   ' of '+money(activePaycheckRun.total_gross)+
   '. Approved does not mean paid: each release requires acknowledgment and reference.';
 const host=document.getElementById('paycheckReleaseBody');
 if(!total){host.innerHTML='<tr><td colspan="6" class="payroll-empty">No employee or Group Labor paychecks found.</td></tr>';return;}
 host.innerHTML=activePaycheckEntries.map(e=>{
   const c=activePaycheckClaims.find(x=>
     e.kind==='EMPLOYEE'?x.payroll_item_id===e.itemId:x.payroll_group_item_id===e.itemId
   );
   const status=c?'<span class="payroll-status claimed">CLAIMED / PAID</span>':'<span class="payroll-status approved">READY FOR CLAIM</span>';
   const detail=c?escapeHtml(c.recipient_name)+' • '+escapeHtml(c.payment_method)+' • '+escapeHtml(c.payment_reference)+'<span class="payroll-sub">'+escapeHtml(c.released_on)+' • '+escapeHtml(c.acknowledgment)+'</span>':'Not yet released';
   const action=!c&&canRelease
     ? '<button class="button primary payroll-history-action" type="button" data-payroll-claim="'+escapeHtml(e.itemId)+'">RELEASE PAYCHECK</button>'
     : c?'<span class="payroll-sub">Payment recorded</span>':'<span class="payroll-sub">Authorized cashier required</span>';
   return '<tr><td><strong>'+escapeHtml(e.name)+'</strong>'+ (e.projectId?'<span class="payroll-sub">Project: '+escapeHtml(e.projectId)+'</span>':'')+
   '</td><td>'+escapeHtml(e.kind==='GROUP'?'GROUP LABOR':'EMPLOYEE')+'</td><td class="payroll-gross">'+money(e.amount)+
   '</td><td>'+status+'</td><td>'+detail+'</td><td>'+action+'</td></tr>';
 }).join('');
}
function openPaycheckClaim(itemId){
 const entry=activePaycheckEntries.find(e=>e.itemId===itemId);
 if(!entry || !activePaycheckRun)return;
 pendingClaimEntry=entry;
 document.getElementById('paycheckClaimPayee').textContent=entry.name+' • '+money(entry.amount)+' • '+entry.kind;
 document.getElementById('paycheckClaimRecipient').value=entry.name;
 const manilaParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
   timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).map(p=>[p.type,p.value]));
 document.getElementById('paycheckClaimDate').value=manilaParts.year+'-'+manilaParts.month+'-'+manilaParts.day;
 document.getElementById('paycheckClaimReference').value='';
 document.getElementById('paycheckClaimAck').value='';
 document.getElementById('paycheckClaimMethod').value='CASH';
 document.getElementById('paycheckClaimError').textContent='';
 paycheckReleaseAwaitingConfirmation=false;
 document.getElementById('paycheckClaimConfirmNotice').hidden=true;
 document.getElementById('paycheckClaimSubmit').textContent='RECORD PAYMENT RELEASE';
 const modal=document.getElementById('paycheckClaimModal');
 modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');
 document.getElementById('paycheckClaimRecipient').focus();
}
function closePaycheckClaim(){
 if(paycheckClaimBusy)return;
 paycheckReleaseAwaitingConfirmation=false;
 pendingClaimEntry=null;
 document.getElementById('paycheckClaimConfirmNotice').hidden=true;
 document.getElementById('paycheckClaimSubmit').textContent='RECORD PAYMENT RELEASE';
 const modal=document.getElementById('paycheckClaimModal');
 modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');
}
async function savePaycheckClaim(event){
 event.preventDefault();
 if(paycheckClaimBusy||!pendingClaimEntry||!activePaycheckRun)return;
 const entry=pendingClaimEntry;
 const recipient=document.getElementById('paycheckClaimRecipient').value.trim();
 const date=document.getElementById('paycheckClaimDate').value;
 const method=document.getElementById('paycheckClaimMethod').value;
 const ref=document.getElementById('paycheckClaimReference').value.trim();
 const ack=document.getElementById('paycheckClaimAck').value.trim();
 if(!recipient||!date||!ref||!ack){
   document.getElementById('paycheckClaimError').textContent='Complete the recipient, release date, unique reference, and acknowledgment.';
   return;
 }
 if(!paycheckReleaseAwaitingConfirmation){
   paycheckReleaseAwaitingConfirmation=true;
   const note=document.getElementById('paycheckClaimConfirmNotice');
   note.textContent='CONFIRM RELEASE: '+money(entry.amount)+' was physically paid to '+recipient+
      '. Click CONFIRM & RECORD RELEASE to finalize. A duplicate claim will not be allowed.';
   note.hidden=false;
   document.getElementById('paycheckClaimSubmit').textContent='CONFIRM & RECORD RELEASE';
   return;
 }
 paycheckClaimBusy=true;
 const btn=document.getElementById('paycheckClaimSubmit');
 btn.disabled=true;
 try{
   const {error}=await supabaseClient.rpc('amanah_payroll_record_claim',{
     p_run_id:activePaycheckRun.payroll_run_id,p_item_type:entry.kind,p_item_id:entry.itemId,
     p_recipient:recipient,p_payment_method:method,p_reference:ref,p_ack:ack,p_paid_on:date
   });
   if(error)throw error;
   paycheckClaimBusy=false;closePaycheckClaim();
   showMessage('Paycheck released and receipt recorded successfully.','success');
   await reloadPaycheckPanel();
 }catch(error){
   document.getElementById('paycheckClaimError').textContent=error.message||'Unable to record the payment release.';
 }finally{paycheckClaimBusy=false;btn.disabled=false;}
}

document.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('manualPayrollButton').addEventListener('click',openManualPayrollModal);
  document.getElementById('manualPayrollClose').addEventListener('click',closeManualPayrollModal);
  document.getElementById('manualPayrollCancel').addEventListener('click',closeManualPayrollModal);
  document.querySelector('#manualPayrollModal .manual-payroll-backdrop').addEventListener('click',closeManualPayrollModal);
  document.getElementById('manualPayrollAdd').addEventListener('click',addManualPayrollEntry);
  document.getElementById('manualPayrollEmployee').addEventListener('input',updateManualPayrollPreview);
  document.getElementById('manualPayrollEmployee').addEventListener('change',updateManualPayrollPreview);
  ['manualFullDays','manualHalfDays','manualHours'].forEach(id=>{
    document.getElementById(id).addEventListener('input',updateManualPayrollPreview);
  });

  document.getElementById('groupLaborButton').addEventListener('click',openGroupLaborModal);
  document.getElementById('groupLaborClose').addEventListener('click',closeGroupLaborModal);
  document.getElementById('groupLaborCancel').addEventListener('click',closeGroupLaborModal);
  document.querySelector('#groupLaborModal .manual-payroll-backdrop').addEventListener('click',closeGroupLaborModal);
  document.getElementById('groupLaborAdd').addEventListener('click',addGroupLaborEntry);
  document.getElementById('groupLaborRate').addEventListener('input',updateGroupLaborPreview);
  document.getElementById('groupLaborMeters').addEventListener('input',updateGroupLaborPreview);
  renderGroupLabor();

  document.getElementById('calculatePayrollButton').addEventListener('click',()=>{
    calculatePayroll().catch(error=>showMessage(error.message||'Unable to calculate payroll.','error'));
  });
  document.getElementById('savePayrollButton').addEventListener('click',savePayroll);
  document.getElementById('printPayrollButton').addEventListener('click',printPayroll);
  document.getElementById('refreshPayrollHistoryButton').addEventListener('click',loadPayrollHistory);
  document.getElementById('payrollHistoryBody').addEventListener('click',event=>{
    const submit=event.target.closest('[data-payroll-submit]');
    const open=event.target.closest('[data-payroll-open]');
    if(submit)submitHistoricalPayroll(submit.dataset.payrollSubmit);
    if(open)openPaycheckPanel(open.dataset.payrollOpen)
      .catch(error=>showMessage(error.message||'Unable to open paycheck claims.','error'));
  });
  document.getElementById('closePaycheckPanel').addEventListener('click',closePaycheckPanel);
  document.getElementById('paycheckReleaseBody').addEventListener('click',event=>{
    const btn=event.target.closest('[data-payroll-claim]');
    if(btn)openPaycheckClaim(btn.dataset.payrollClaim);
  });
  document.getElementById('paycheckClaimForm').addEventListener('submit',savePaycheckClaim);
  document.getElementById('paycheckClaimForm').addEventListener('input',()=>{
    if(!paycheckReleaseAwaitingConfirmation)return;
    paycheckReleaseAwaitingConfirmation=false;
    document.getElementById('paycheckClaimConfirmNotice').hidden=true;
    document.getElementById('paycheckClaimSubmit').textContent='RECORD PAYMENT RELEASE';
  });
  document.getElementById('paycheckClaimCancel').addEventListener('click',closePaycheckClaim);
  document.getElementById('paycheckClaimClose').addEventListener('click',closePaycheckClaim);
  document.getElementById('paycheckClaimModal').addEventListener('click',event=>{
    if(event.target.id==='paycheckClaimModal')closePaycheckClaim();
  });
  document.getElementById('payrollEmployeeFilter').addEventListener('change',()=>{
    calculatedPeriod=null;
    payrollRows=[];
    document.getElementById('payrollBody').innerHTML='<tr><td colspan="9" class="payroll-empty">Select a payroll period and calculate payroll.</td></tr>';
    updateSummary();
  });

  const today=new Date();
  const start=new Date(today.getFullYear(),today.getMonth(),1);
  const end=new Date(today.getFullYear(),today.getMonth()+1,0);
  const iso=d=>d.toISOString().slice(0,10);
  document.getElementById('payrollStart').value=iso(start);
  document.getElementById('payrollEnd').value=iso(end);

  if(await requireSession()){
    try{
      const {data,error}=await supabaseClient
        .from('employees')
        .select('employee_id,employee_name,department,hourly_rate,daily_rate,status')
        .eq('status','ACTIVE')
        .order('employee_name');

      if(error)throw error;
      payrollEmployees = data || [];
      populatePayrollEmployeeFilter(payrollEmployees);
      await Promise.all([loadPayrollHistory(),loadGroupLaborProjects()]);
    }catch(error){
      showMessage(error.message||'Unable to load employee list or projects.','error');
    }
  }
});