const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let payrollEmployees=[];
let payrollAttendance=[];
let payrollRows=[];
let calculatedPeriod=null;
let payrollEmployeeOptions=[];
let groupLaborRows=[];



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

function openGroupLaborModal(){
  clearMessage();
  document.getElementById('groupLaborName').value='';
  document.getElementById('groupLaborActivity').value='';
  document.getElementById('groupLaborRate').value='';
  document.getElementById('groupLaborMeters').value='';
  document.getElementById('groupLaborError').textContent='';
  updateGroupLaborPreview();

  const modal=document.getElementById('groupLaborModal');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden','false');
}

function closeGroupLaborModal(){
  const modal=document.getElementById('groupLaborModal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden','true');
}

function addGroupLaborEntry(){
  const error=document.getElementById('groupLaborError');
  error.textContent='';

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
    body.innerHTML='<tr><td colspan="5" class="payroll-empty">No group labor entries added.</td></tr>';
    document.getElementById('groupLaborGross').textContent=money(0);
    return;
  }

  body.innerHTML=groupLaborRows.map((row,index)=>`
    <tr>
      <td><strong>${escapeHtml(row.groupName)}</strong></td>
      <td>${escapeHtml(row.activity)}</td>
      <td class="payroll-rate">${money(row.ratePerMeter)}<span class="payroll-sub">PER METER</span></td>
      <td>${num(row.metersAccomplished).toFixed(2)}</td>
      <td class="payroll-gross">
        ${money(groupLaborGross(row))}
        <button type="button" class="group-labor-remove" data-group-index="${index}">REMOVE</button>
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
  return normalizeDepartment(employee?.department)==='TRUCKERS';
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
  document.getElementById('savePayrollButton').disabled=!hasPayrollRows||!calculatedPeriod;
  document.getElementById('printPayrollButton').disabled=!hasPayrollRows||!calculatedPeriod;

}

async function calculatePayroll(){
  clearMessage();
  if(!(await requireSession()))return;

  const start=document.getElementById('payrollStart').value;
  const end=document.getElementById('payrollEnd').value;
  if(!start||!end){showMessage('Please select both the payroll start date and end date.','error');return;}
  if(end<start){showMessage('Payroll end date cannot be earlier than the start date.','error');return;}

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
  if(!calculatedPeriod||(!payrollRows.length&&!groupLaborRows.length)){showMessage('Add employee payroll or group labor before saving.','error');return;}
  const button=document.getElementById('savePayrollButton');
  button.disabled=true;
  button.textContent='SAVING...';

  try{
    const totalGross=
      payrollRows.reduce((sum,r)=>sum+grossFor(r),0)+
      groupLaborRows.reduce((sum,r)=>sum+groupLaborGross(r),0);
    const {data:run,error:runError}=await supabaseClient.from('payroll_runs').insert({
      period_start:calculatedPeriod.start,
      period_end:calculatedPeriod.end,
      status:'DRAFT',
      total_gross:Number(totalGross.toFixed(2)),
      employee_count:payrollRows.length
    }).select('payroll_run_id').single();

    if(runError)throw runError;

    const items=payrollRows.map(row=>({
      payroll_run_id:run.payroll_run_id,
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
      attendance_ids:row.attendanceIds
    }));

    if(items.length){
      const {error:itemError}=await supabaseClient.from('payroll_items').insert(items);
      if(itemError)throw itemError;
    }

    if(groupLaborRows.length){
      const groupItems=groupLaborRows.map(row=>({
        payroll_run_id:run.payroll_run_id,
        group_name:row.groupName,
        activity_description:row.activity,
        rate_per_meter:Number(row.ratePerMeter.toFixed(2)),
        meters_accomplished:Number(row.metersAccomplished.toFixed(2)),
        gross_pay:Number(groupLaborGross(row).toFixed(2))
      }));

      const {error:groupError}=await supabaseClient
        .from('payroll_group_items')
        .insert(groupItems);

      if(groupError)throw groupError;
    }

    showMessage('Payroll run saved successfully.','success');
    await loadPayrollHistory();
  }catch(error){
    showMessage(error.message||'Unable to save payroll.','error');
  }finally{
    button.disabled=false;
    button.textContent='SAVE PAYROLL';
    updateSummary();
  }
}

async function loadPayrollHistory(){
  const body=document.getElementById('payrollHistoryBody');
  const {data,error}=await supabaseClient.from('payroll_runs').select('period_start,period_end,status,total_gross,employee_count,created_at').order('created_at',{ascending:false}).limit(50);
  if(error){
    body.innerHTML='<tr><td colspan="5" class="payroll-empty">Unable to load payroll history.</td></tr>';
    return;
  }

  if(!data?.length){
    body.innerHTML='<tr><td colspan="5" class="payroll-empty">No payroll runs found.</td></tr>';
    return;
  }

  body.innerHTML=data.map(run=>{
    const created=run.created_at?new Date(run.created_at).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
    const cls=String(run.status).toLowerCase();
    return `<tr>
      <td><strong>${escapeHtml(dateText(run.period_start))}</strong> – ${escapeHtml(dateText(run.period_end))}</td>
      <td>${escapeHtml(run.employee_count)}</td>
      <td class="payroll-gross">${money(run.total_gross)}</td>
      <td><span class="payroll-status ${cls}">${escapeHtml(run.status)}</span></td>
      <td>${escapeHtml(created)}</td>
    </tr>`;
  }).join('');
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
      await loadPayrollHistory();
    }catch(error){
      showMessage(error.message||'Unable to load employee list.','error');
    }
  }
});