/* Read-only reporting from the canonical project-cost ledger. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.AmanahProjectExpenses=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const labels={MATERIAL:'Materials',PAYROLL:'Payroll / group labor',LUMP_SUM:'Lump-sum payments',LABOR:'Other labor',EQUIPMENT:'Equipment',FUEL:'Fuel',OTHER:'Other expenses'};
  const cents=value=>{
    const n=Number(value);
    if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100)))throw Error('An expense contains an invalid amount.');
    return Math.round(n*100);
  };
  function category(row){
    const ref=String(row.reference_id||'');
    if(ref.startsWith('LUMP-SUM:PAYMENT:'))return 'LUMP_SUM';
    if(ref.startsWith('PAYROLL-EMPLOYEE:')||ref.startsWith('GROUP-LABOR:'))return 'PAYROLL';
    return Object.hasOwn(labels,row.cost_type)?row.cost_type:'OTHER';
  }
  function source(row){
    const ref=String(row.reference_id||'');
    if(ref.startsWith('LUMP-SUM:PAYMENT:'))return 'Paid lump-sum payment';
    if(ref.startsWith('PAYROLL-EMPLOYEE:'))return 'Paid employee payroll';
    if(ref.startsWith('GROUP-LABOR:'))return 'Paid group labor';
    if(ref.startsWith('PO-MATERIAL-RECEIVED:'))return 'Posted purchase materials';
    return 'Recorded '+(labels[row.cost_type]||'expense').toLowerCase();
  }
  function paymentLink(row){
    const id=String(row.reference_id||'').match(/^LUMP-SUM:PAYMENT:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
    return id?'lump-sum.html?payment='+encodeURIComponent(id):'';
  }
  function summarize(entries){
    const buckets=new Map(Object.keys(labels).map(key=>[key,{key,label:labels[key],cents:0,count:0}]));
    const ids=new Set();let total=0;
    for(const row of entries){
      if(!row.id||ids.has(row.id))throw Error('Expense records are duplicated or missing an ID. Refresh the report.');
      ids.add(row.id);const value=cents(row.amount);const bucket=buckets.get(category(row));
      total+=value;bucket.cents+=value;bucket.count++;
      if(!Number.isSafeInteger(total))throw Error('Expense total exceeds the supported reporting range.');
    }
    return{total:total/100,count:entries.length,breakdown:[...buckets.values()].filter(x=>x.count||x.key==='LUMP_SUM').map(x=>({...x,amount:x.cents/100}))};
  }
  function projects(rows,entries){
    const byProject=new Map();
    for(const entry of entries){if(!byProject.has(entry.project_id))byProject.set(entry.project_id,[]);byProject.get(entry.project_id).push(entry);}
    return rows.map(row=>{
      const expenses=(byProject.get(row.project_id)||[]).slice().sort((a,b)=>String(b.cost_date||'').localeCompare(String(a.cost_date||''))||String(b.id).localeCompare(String(a.id)));
      const summary=summarize(expenses);
      if(row.actual_cost!=null&&cents(row.actual_cost)!==cents(summary.total))throw Error('Project expenses changed while the report was loading. Refresh costs to load a consistent total.');
      return{...row,actual_cost:summary.total,expenses,breakdown:summary.breakdown,expense_count:summary.count};
    });
  }
  async function readAll(client,table,columns='*',options={}){
    const result=[],seen=new Set(),paymentReferences=new Set();let cursor=null;
    const pageSize=1000;
    while(true){
      if(options.isCurrent&&!options.isCurrent())return null;
      let query=client.from(table).select(columns).order('id',{ascending:true}).limit(pageSize);
      if(options.projectId)query=query.eq('project_id',options.projectId);
      if(options.prefix)query=query.like('reference_id',options.prefix+'%');
      if(cursor)query=query.gt('id',cursor);
      const {data,error}=await query;
      if(error)throw error;
      if(options.isCurrent&&!options.isCurrent())return null;
      if(!Array.isArray(data))throw Error('Expense records could not be read. Refresh the report.');
      for(const row of data){
        if(!row.id||seen.has(row.id))throw Error('Expense pagination returned a duplicate record. Refresh the report.');
        if(table==='project_cost_entries'&&String(row.reference_id||'').startsWith('LUMP-SUM:PAYMENT:')){
          if(paymentReferences.has(row.reference_id))throw Error('A lump-sum payment changed while expenses were loading. Refresh the report.');
          paymentReferences.add(row.reference_id);
        }
        seen.add(row.id);result.push(row);
      }
      if(!data.length)return result;
      const next=data.at(-1).id;
      if(cursor&&next<=cursor)throw Error('Expense pagination did not advance. Refresh the report.');
      cursor=next;
    }
  }
  const readCosts=(client,options={})=>readAll(client,'project_cost_entries','id,project_id,cost_date,cost_type,description,quantity,unit,unit_cost,amount,reference_id',options);
  function paymentPosting(payment,projectId,entries){
    const ref='LUMP-SUM:PAYMENT:'+payment.id;
    const matches=entries.filter(e=>e.reference_id===ref);
    const assigned=matches.filter(e=>e.project_id===projectId&&e.cost_type==='LABOR');
    const total=assigned.reduce((sum,e)=>sum+cents(e.amount),0);
    const posted=matches.length===1&&assigned.length===1&&total===cents(payment.amount);
    return{posted,amount:total/100,entry:posted?assigned[0]:null,status:posted?'POSTED':matches.length?'REVIEW POSTING':'NO MATCHING POSTING'};
  }
  return{labels,cents,category,source,paymentLink,summarize,projects,readAll,readCosts,paymentPosting};
});
