const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const M=require('../amanah-project-expenses.js');
const root=path.resolve(__dirname,'..');
const paymentId='11111111-2222-4333-8444-555555555555';
function entry(id,type,amount,ref='',project='P'){
 return{id,project_id:project,cost_type:type,amount,reference_id:ref,cost_date:'2026-11-04',description:'Expense '+id,quantity:1,unit:'item',unit_cost:amount};
}
function client(tables,options={}){
 const calls=[];
 return{calls,rpc:async()=>{calls.push('rpc');return{data:options.projects||[],error:null};},from(table){
  calls.push(table);let cursor='',filters=[];
  const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},like(k,v){filters.push(r=>String(r[k]||'').startsWith(v.slice(0,-1)));return q;},gt(k,v){cursor=v;return q;},
   then(resolve,reject){
    if(options.errorAfterCursor&&cursor)return Promise.resolve({data:null,error:{message:'Read failed'}}).then(resolve,reject);
    const data=(tables[table]||[]).filter(r=>!cursor||r.id>cursor).filter(r=>filters.every(f=>f(r))).slice().sort((a,b)=>a.id.localeCompare(b.id)).slice(0,options.cap||1000);
    return Promise.resolve({data,error:null}).then(resolve,reject);
   }};return q;
 }};
}
test('each specific expense contributes once and paid lump-sum costs stay separate from other labor',()=>{
 const rows=[entry('1','MATERIAL',10000),entry('2','FUEL',13100),entry('3','EQUIPMENT',3000),entry('4','LABOR',1504,'PAYROLL-EMPLOYEE:run:item'),entry('5','LABOR',500,'LUMP-SUM:PAYMENT:'+paymentId),entry('6','LABOR',250)];
 const summary=M.summarize(rows);
 assert.equal(summary.total,28354);assert.equal(summary.count,6);
 assert.equal(summary.breakdown.reduce((s,b)=>s+b.cents,0),2835400);
 assert.equal(summary.breakdown.find(b=>b.key==='LUMP_SUM').amount,500);
 assert.equal(summary.breakdown.find(b=>b.key==='LABOR').amount,250);
 assert.equal(summary.breakdown.find(b=>b.key==='PAYROLL').amount,1504);
 assert.equal(M.paymentLink(rows[4]),'lump-sum.html?payment='+paymentId);
});
test('cent totals are exact and malformed or duplicate expenses are rejected',()=>{
 assert.equal(M.summarize([entry('1','OTHER',.1),entry('2','OTHER',.2)]).total,.3);
 assert.throws(()=>M.summarize([entry('1','OTHER',1),entry('1','OTHER',1)]),/duplicated/);
 assert.throws(()=>M.summarize([entry('1','OTHER',-1)]),/invalid/);
 assert.throws(()=>M.summarize([entry('1','OTHER','not money')]),/invalid/);
 assert.equal(M.paymentLink(entry('1','LABOR',1,'LUMP-SUM:PAYMENT:<script>')),'');
});
test('projects without estimates retain all actual expenses and project totals remain isolated',()=>{
 const result=M.projects([{project_id:'P',estimate_cost:null,actual_cost:50},{project_id:'Q',estimate_cost:100,actual_cost:25}],
  [entry('1','MATERIAL',50),entry('2','FUEL',25,'','Q'),entry('3','OTHER',99,'','UNRELATED')]);
 assert.equal(result[0].actual_cost,50);assert.equal(result[0].expense_count,1);assert.equal(result[0].estimate_cost,null);
 assert.equal(result[1].actual_cost,25);assert.equal(result[1].expenses[0].project_id,'Q');
 assert.equal(M.summarize([]).breakdown.find(b=>b.key==='LUMP_SUM').amount,0);
});
test('pagination reads every record even when the server returns fewer than the requested page size',async()=>{
 const db=client({project_cost_entries:[1,2,3,4,5].map(n=>entry(String(n),'OTHER',n))},{cap:2});
 const rows=await M.readCosts(db);
 assert.equal(rows.length,5);assert.equal(M.summarize(rows).total,15);assert.equal(db.calls.length,4);
 const filtered=await M.readCosts(client({project_cost_entries:[entry('1','LABOR',1,'LUMP-SUM:PAYMENT:'+paymentId),entry('2','OTHER',2)]}),{prefix:'LUMP-SUM:PAYMENT:'});
 assert.equal(filtered.length,1);
});
test('failed or superseded reads never return a partial expense report',async()=>{
 const db=client({project_cost_entries:[entry('1','OTHER',1),entry('2','OTHER',2)]},{cap:1,errorAfterCursor:true});
 await assert.rejects(M.readCosts(db),e=>e.message==='Read failed');
 const cancelled=await M.readCosts(client({project_cost_entries:[]}),{isCurrent:()=>false});assert.equal(cancelled,null);
});
test('contract payment posting checks amount, project, labor type and unique source identity',()=>{
 const payment={id:paymentId,amount:500};const row=entry('1','LABOR',500,'LUMP-SUM:PAYMENT:'+paymentId);
 assert.equal(M.paymentPosting(payment,'P',[row]).status,'POSTED');
 assert.equal(M.paymentPosting(payment,'P',[]).status,'NO MATCHING POSTING');
 for(const rows of [[{...row,project_id:'Q'}],[{...row,amount:450}],[{...row,cost_type:'OTHER'}],[row,{...row,id:'2'}]])assert.equal(M.paymentPosting(payment,'P',rows).status,'REVIEW POSTING');
});

test('a changing ledger is detected before inconsistent or repeated payment costs are displayed',async()=>{
 assert.throws(()=>M.projects([{project_id:'P',actual_cost:51}],[entry('1','FUEL',50)]),/changed while/);
 const ref='LUMP-SUM:PAYMENT:'+paymentId;
 const db=client({project_cost_entries:[entry('1','LABOR',10,ref),entry('2','LABOR',10,ref)]},{cap:1});
 await assert.rejects(M.readCosts(db),/payment changed while/);
});

class Element{
 constructor(){this.innerHTML='';this.textContent='';this.hidden=true;this.disabled=false;this.value='';this.dataset={};this.style={};this.events={};this.classList={add(){},remove(){},toggle(){}};}
 addEventListener(name,fn){this.events[name]=fn;}
 querySelectorAll(){return [];}
 replaceChildren(){this.innerHTML='';}
 appendChild(node){this.innerHTML+=node.textContent;}
 setAttribute(){}
}
function harness(file,db,options={}){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const document={getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),hidden:false};
 const window={AmanahProjectExpenses:M,supabase:{createClient:()=>db},__AMANAH_DASHBOARD_PERMS:{financial:options.financial!==false},setInterval(){},addEventListener(){},matchMedia:()=>({matches:false})};
 const context=vm.createContext({window,document,location:{search:options.search||'',pathname:file.replace('.js','.html')},history:{replaceState(){}},URLSearchParams,URL,Intl,console:{error(){},warn(){},log(){}},setTimeout,clearTimeout,crypto:globalThis.crypto});
 vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 return{context,get,run:code=>vm.runInContext(code,context)};
}
test('dashboard renders actual amounts without estimates, categories and each escaped transaction',async()=>{
 const rows=[entry('1','FUEL',100),entry('2','LABOR',500,'LUMP-SUM:PAYMENT:'+paymentId)];rows[0].description='<img src=x onerror=bad>';
 const h=harness('dashboard.js',client({project_cost_entries:rows},{projects:[{project_id:'P',project_name:'School',project_type:'SCHOOL BUILDING',estimate_cost:null,actual_cost:600}]}));
 await h.run('loadDashboardProjectCostChart()');
 assert.match(h.get('costChartTotalExpenses').textContent,/600\.00/);
 const html=h.get('projectCostChartList').innerHTML;
 assert.match(html,/600\.00 recorded/);assert.match(html,/Lump-sum payments/);assert.match(html,/View 2 recorded expenses/);
 assert.match(html,/lump-sum\.html\?payment=/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});
test('dashboard shows every expense through incremental display and blocks non-financial reads',async()=>{
 const rows=Array.from({length:28},(_,i)=>entry(String(i).padStart(3,'0'),'OTHER',1));
 const db=client({project_cost_entries:rows},{projects:[{project_id:'P',project_name:'School',estimate_cost:100}]});
 const h=harness('dashboard.js',db);await h.run('loadDashboardProjectCostChart()');
 assert.match(h.get('projectCostChartList').innerHTML,/25 of 28 expenses/);assert.match(h.get('projectCostChartList').innerHTML,/Show 25 more/);
 h.get('projectCostChartList').events.click({target:{closest:()=>({dataset:{expenseMore:'P'}})}});
 assert.match(h.get('projectCostChartList').innerHTML,/28 of 28 expenses/);assert.doesNotMatch(h.get('projectCostChartList').innerHTML,/Show 25 more/);
 const blocked=client({});const viewer=harness('dashboard.js',blocked,{financial:false});await viewer.run('loadDashboardProjectCostChart()');assert.equal(blocked.calls.length,0);
});
test('dashboard reports read errors instead of presenting a partial total as complete',async()=>{
 const db=client({project_cost_entries:[entry('1','FUEL',10),entry('2','FUEL',20)]},{cap:1,errorAfterCursor:true,projects:[{project_id:'P'}]});
 const h=harness('dashboard.js',db);await h.run('loadDashboardProjectCostChart()');
 assert.equal(h.get('costChartError').hidden,false);assert.match(h.get('costChartError').textContent,/complete expense report/);
 assert.doesNotMatch(h.get('projectCostChartList').innerHTML,/10\.00 recorded/);
});
test('lump-sum contract displays exact matching project cost postings and distinguishes unavailable checks',()=>{
 const h=harness('lump-sum.js',client({}),{search:'?payment='+paymentId});
 h.context.fixture={payment:{id:paymentId,contract_id:'C',amount:500,paid_on:'2026-11-04',payment_kind:'ADVANCE',payment_method:'CASH',payment_reference:'REF-1'},entry:entry('ledger1','LABOR',500,'LUMP-SUM:PAYMENT:'+paymentId)};
 h.run("ls.payments=[fixture.payment];ls.costEntries=[fixture.entry];renderPayments({id:'C',project_id:'P'})");
 assert.match(h.get('lsPayments').innerHTML,/POSTED/);assert.match(h.get('lsPayments').innerHTML,/Entry ledger1/);assert.match(h.get('lsPayments').innerHTML,/ls-payment-selected/);
 assert.match(h.get('lsProjectCostPosting').innerHTML,/500\.00/);assert.match(h.get('lsProjectCostPosting').innerHTML,/1 of 1/);
 h.run("ls.costError={message:'No access'};renderPayments({id:'C',project_id:'P'})");
 assert.match(h.get('lsPayments').innerHTML,/STATUS UNAVAILABLE/);assert.match(h.get('lsProjectCostPosting').innerHTML,/unavailable/);
});
test('payment deep links open the corresponding contract using the current payment records',async()=>{
 const contract={id:'C',project_id:'P',status:'ACTIVE',contract_type:'DIRECT_LABOR',scope_title:'School labor',original_amount:1000,contractor_name:'Crew'};
 const payment={id:paymentId,contract_id:'C',amount:500,paid_on:'2026-11-04',payment_kind:'ADVANCE',created_at:'2026-11-04'};
 const h=harness('lump-sum.js',client({projects:[{id:'projectrow',project_id:'P',project_name:'School'}],amanah_lump_contracts:[contract],amanah_lump_payments:[payment],project_cost_entries:[entry('ledger1','LABOR',500,'LUMP-SUM:PAYMENT:'+paymentId)]}),{search:'?payment='+paymentId});
 await h.run('loadAll()');assert.equal(h.run('ls.selected'),'C');assert.equal(h.get('lsDetailPanel').hidden,false);assert.match(h.get('lsPayments').innerHTML,/POSTED/);
});
