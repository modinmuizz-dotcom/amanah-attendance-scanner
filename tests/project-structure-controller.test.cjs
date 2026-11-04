const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const M=require('../project-structure-model.js');
const root=path.resolve(__dirname,'..');
class Element {
  constructor(){this.listeners={};this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.value='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){},add(){},remove(){}};}
  addEventListener(name,fn,options={}){(this.listeners[name]??=[]).push({fn,once:options.once});}
  async emit(name,event={}){for(const l of [...(this.listeners[name]||[])]){if(l.once)this.listeners[name]=this.listeners[name].filter(x=>x!==l);await l.fn(event);}}
  set innerHTML(value){this.html=value;this.dynamic=new Map();}
  get innerHTML(){return this.html||'';}
  querySelector(selector){
    const match=selector.match(/^\[data-(group-weight|group-remaining|item-contribution)="([^"]+)"\]$/);
    if(!match||!this.innerHTML.includes('data-'+match[1]+'="'+match[2]+'"'))return null;
    if(!this.dynamic.has(selector))this.dynamic.set(selector,new Element());
    return this.dynamic.get(selector);
  }
  querySelectorAll(){return [];}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  focus(){}
  select(){}
  showModal(){queueMicrotask(()=>{if(this.reason.required)this.reason.value='Revise the agreed work allocation';this.close('confirm');});}
  close(value){this.returnValue=value;this.emit('close');}
}
async function harness(options={}){
  const html=fs.readFileSync(path.join(root,'project-structure.html'),'utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'DOM IDs must be unique');
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  nodes.scopeBar.parentElement=new Element();nodes.structureConfirm.reason=nodes.structureReason;
  let ready,saved=options.saved||null;const calls=[],redirects=[];
  const project={project_id:'TEST-SCHOOL',project_name:'School <One>',project_type:'SCHOOL BUILDING',location:'Test site',status:'ACTIVE'};
  const canManage=options.canManage!==false;
  const client={
    auth:{getSession:async()=>({data:{session:options.loggedOut?null:{user:{id:'test'}}},error:null}),onAuthStateChange(){}},
    from(){return{select(){return this;},in(){return this;},order:async()=>({data:[project],error:null})};},
    rpc:async(name,params)=>{
      calls.push({name,params});
      if(name==='amanah_project_structure_get_v2')return{data:{project,structure:saved,events:[],can_manage:canManage},error:null};
      if(options.writeError)return{data:null,error:options.writeError};
      assert.equal(name,'amanah_project_structure_write_v2');
      assert.equal(params.p_expected_revision,saved?.revision||0);
      if(params.p_action==='SAVE')saved={project_id:project.project_id,project_type:project.project_type,groups:JSON.parse(JSON.stringify(params.p_groups)),revision:(saved?.revision||0)+1,baseline_version:saved?.baseline_version||1,status:'DRAFT',updated_at:'2026-11-02T08:00:00Z'};
      else if(params.p_action==='BASELINE')saved={...saved,revision:saved.revision+1,status:'BASELINED'};
      else if(params.p_action==='REOPEN')saved={...saved,revision:saved.revision+1,status:'DRAFT',baseline_version:saved.baseline_version+1};
      return{data:saved,error:null};
    }
  };
  const document={getElementById:id=>{assert.ok(nodes[id],'Unknown DOM ID '+id);return nodes[id];},addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')ready=fn;}};
  const context={window:{AmanahProjectStructure:M,supabase:{createClient:()=>client},setTimeout,clearTimeout,addEventListener(){}},document,location:{search:'?project_id=TEST-SCHOOL',replace:url=>redirects.push(url)},history:{replaceState(){}},URLSearchParams,console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'project-structure.js'),'utf8'),context);
  await ready();
  const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
  const action=async dataset=>{await nodes.structureGroups.emit('click',{target:{closest:()=>({dataset})}});await flush();};
  const rowInputs=item=>{
    const row=nodes.structureGroups.innerHTML.match(new RegExp('<tr[^>]*data-item="'+item.id+'"[^>]*>([\\s\\S]*?)</tr>'))?.[1];
    assert.ok(row,'Work item must be rendered');
    return Object.fromEntries([...row.matchAll(/<input\b[^>]*>/g)].map(([tag])=>[tag.match(/data-field="([^"]+)"/)[1],{disabled:/\sdisabled(?:\s|>)/.test(tag)}]));
  };
  return{nodes,calls,redirects,saved:()=>saved,flush,action,rowInputs,
    editItem:(group,item)=>action({editItem:item.id,group:group.id}),editGroup:group=>action({editGroup:group.id}),
    click:async id=>{await nodes[id].emit('click');await flush();},groupInput:async(group,value)=>nodes.structureGroups.emit('input',{target:{dataset:{groupShare:group.id},value}}),input:async(group,item,field,value)=>nodes.structureGroups.emit('input',{target:{dataset:{field},value,closest:selector=>selector==='[data-group]'?{dataset:{group:group.id}}:{dataset:{item:item.id}}}})};
}
test('page controls load a template, save its weights, establish and revise the baseline',async()=>{
  const h=await harness();
  assert.equal(h.nodes.structureProjectName.textContent,'School <One>');
  await h.click('loadStructureTemplate');
  assert.match(h.nodes.structureGroups.innerHTML,/EXCAVATION/);
  assert.equal(h.nodes.baselineStructure.disabled,true);
  await h.click('saveStructure');
  assert.equal(h.saved().revision,1);assert.equal(h.nodes.structureDirty.hidden,true);
  const groups=h.saved().groups;
  for(let gi=0;gi<groups.length;gi++){
    const group=groups[gi];await h.editGroup(group);await h.groupInput(group,String(gi===0?60:40));
    const base=Math.floor(10000/group.items.length);
    for(let i=0;i<group.items.length;i++){
      await h.editItem(group,group.items[i]);
      await h.input(group,group.items[i],'weight',String((i===group.items.length-1?10000-base*i:base)/100));
    }
  }
  assert.equal(h.nodes.scopeWeight.textContent,'100.00%');
  assert.equal(h.nodes.baselineStructure.disabled,true,'Unsaved weights must not activate a baseline');
  await h.click('saveStructure');
  assert.equal(h.saved().revision,2);assert.equal(h.nodes.baselineStructure.disabled,false);
  assert.equal(h.saved().groups[0].share,60);assert.equal(h.saved().groups[1].share,40);
  await h.click('baselineStructure');
  assert.equal(h.saved().status,'BASELINED');assert.equal(h.nodes.saveStructure.hidden,true);
  assert.equal(h.nodes.reopenStructure.hidden,false);assert.match(h.nodes.structureGroups.innerHTML,/ disabled/);
  await h.click('reopenStructure');
  assert.equal(h.saved().status,'DRAFT');assert.equal(h.saved().baseline_version,2);
  assert.equal(h.calls.at(-2).params.p_reason,'Revise the agreed work allocation');
});
test('group input updates project totals and each item contribution live',async()=>{
  const a=M.newGroup('STRUCTURAL'),b=M.newGroup('ARCHITECTURAL');a.share=60;b.share=40;
  for(const g of [a,b]){g.items=[M.newItem('A'),M.newItem('B')];g.items.forEach(i=>i.weight=50);}
  const h=await harness({saved:{groups:[a,b],status:'DRAFT',revision:1,baseline_version:1}});
  assert.match(h.nodes.structureGroups.innerHTML,/data-group-share=/);
  await h.editGroup(a);
  await h.groupInput(a,'50');
  assert.equal(h.nodes.scopeWeight.textContent,'90.00%');assert.equal(h.nodes.scopeRemaining.textContent,'10.00%');
  assert.equal(h.nodes.structureGroups.querySelector('[data-item-contribution="'+a.items[0].id+'"]').textContent,'25.00%');
  await h.click('saveStructure');assert.equal(h.saved().groups[0].share,50);assert.equal(h.saved().groups[0].items[0].weight,50);
});
test('incomplete item allocation is visible in its group and the project scope',async()=>{
  const a=M.newGroup('STRUCTURAL'),b=M.newGroup('ARCHITECTURAL');a.share=60;b.share=40;
  for(const g of [a,b]){g.items=[M.newItem('A'),M.newItem('B')];g.items.forEach(i=>i.weight=50);}
  const h=await harness({saved:{groups:[a,b],status:'DRAFT',revision:1,baseline_version:1}});
  await h.editItem(a,a.items[0]);
  await h.input(a,a.items[0],'weight','25');
  assert.equal(h.nodes.scopeWeight.textContent,'100.00%');assert.match(h.nodes.scopeDetail.textContent,/85.00%/);
  assert.equal(h.nodes.structureGroups.querySelector('[data-group-weight="'+a.id+'"]').textContent,'75.00%');
  assert.equal(h.nodes.scopeBar.style.width,'85%');assert.equal(h.nodes.baselineStructure.disabled,true);
});
test('view-only users see the scope without mutation controls',async()=>{
  const groups=M.template('SCHOOL BUILDING');
  const h=await harness({canManage:false,saved:{groups,status:'BASELINED',revision:1,baseline_version:1,updated_at:'2026-11-02T08:00:00Z'}});
  assert.equal(h.nodes.saveStructure.hidden,true);assert.equal(h.nodes.loadStructureTemplate.hidden,true);assert.equal(h.nodes.reopenStructure.hidden,true);
  assert.match(h.nodes.structureGroups.innerHTML,/ disabled/);assert.doesNotMatch(h.nodes.structureGroups.innerHTML,/data-delete-item/);
});
test('a stale save preserves unsaved edits and asks for an explicit reload',async()=>{
  const h=await harness({writeError:{code:'40001',message:'Another user changed this structure.'}});
  await h.click('loadStructureTemplate');await h.click('saveStructure');
  assert.equal(h.nodes.structureDirty.hidden,false);
  assert.match(h.nodes.structureMessage.textContent,/unsaved work is still on screen/);
  assert.match(h.nodes.structureGroups.innerHTML,/EXCAVATION/);
});
test('work labels are escaped when rendered into HTML',async()=>{
  const groups=M.template('SCHOOL BUILDING');groups[0].items[0].name='<img src=x onerror=alert(1)>';
  const h=await harness({saved:{groups,status:'DRAFT',revision:1,baseline_version:1,updated_at:'2026-11-02T08:00:00Z'}});
  assert.doesNotMatch(h.nodes.structureGroups.innerHTML,/<img src=x/);
  assert.match(h.nodes.structureGroups.innerHTML,/&lt;img src=x/);
});
test('a missing session returns to login before project queries',async()=>{
  const h=await harness({loggedOut:true});assert.deepEqual(h.redirects,['admin.html']);assert.equal(h.calls.length,0);
});

test('work items stay locked until Edit and Save draft saves all changes then locks them again',async()=>{
  const group=M.newGroup('STRUCTURAL');group.share=100;
  group.items=[M.newItem('EXCAVATION'),M.newItem('FOOTING')];group.items.forEach(i=>i.weight=50);
  const [first,second]=group.items;
  const h=await harness({saved:{groups:[group],status:'DRAFT',revision:1,baseline_version:1}});
  assert.match(h.nodes.structureGroups.innerHTML,/data-edit-item=/);
  assert.ok(Object.values(h.rowInputs(first)).every(i=>i.disabled));
  assert.equal(h.nodes.saveStructure.disabled,true);
  await h.input(group,first,'weight','25');
  assert.equal(h.nodes.scopeBar.style.width,'100%','Locked input events must not change the scope');
  assert.equal(h.nodes.structureDirty.hidden,true);
  await h.editItem(group,first);
  assert.ok(Object.values(h.rowInputs(first)).every(i=>!i.disabled));
  assert.ok(Object.values(h.rowInputs(second)).every(i=>i.disabled),'Edit unlocks only its own row');
  assert.equal(h.nodes.saveStructure.disabled,true,'Edit alone does not create unsaved data');
  await h.input(group,first,'location','ROOM A');await h.input(group,first,'weight','25');
  await h.input(group,second,'name','IGNORED LOCKED EDIT');
  assert.equal(h.nodes.scopeBar.style.width,'75%');assert.equal(h.nodes.saveStructure.disabled,false);
  await h.click('saveStructure');
  assert.equal(h.saved().groups[0].items[0].location,'ROOM A');
  assert.equal(h.saved().groups[0].items[0].weight,25);
  assert.equal(h.saved().groups[0].items[1].name,'FOOTING');
  assert.ok(Object.values(h.rowInputs(first)).every(i=>i.disabled));
  assert.equal(h.nodes.saveStructure.hidden,false);assert.equal(h.nodes.saveStructure.disabled,true);
});

test('group fields require Edit group independently of work-item editing',async()=>{
  const group=M.newGroup('STRUCTURAL');group.share=100;group.items=[M.newItem('EXCAVATION')];group.items[0].weight=100;
  const h=await harness({saved:{groups:[group],status:'DRAFT',revision:1,baseline_version:1}});
  const groupTag=()=>h.nodes.structureGroups.innerHTML.match(new RegExp('<input[^>]*data-group-share="'+group.id+'"[^>]*>'))[0];
  assert.match(groupTag(),/ disabled/);
  await h.groupInput(group,'90');assert.equal(h.nodes.scopeWeight.textContent,'100.00%');
  await h.editGroup(group);assert.doesNotMatch(groupTag(),/ disabled/);
  assert.ok(Object.values(h.rowInputs(group.items[0])).every(i=>i.disabled));
  await h.groupInput(group,'90');assert.equal(h.nodes.scopeWeight.textContent,'90.00%');
  await h.click('saveStructure');assert.equal(h.saved().groups[0].share,90);assert.match(groupTag(),/ disabled/);
});

test('a failed save preserves the edited row and keeps other rows locked',async()=>{
  const group=M.newGroup('STRUCTURAL');group.share=100;group.items=[M.newItem('A'),M.newItem('B')];group.items.forEach(i=>i.weight=50);
  const h=await harness({saved:{groups:[group],status:'DRAFT',revision:1,baseline_version:1},writeError:{code:'40001',message:'Changed by another engineer'}});
  await h.editItem(group,group.items[0]);await h.input(group,group.items[0],'location','LEVEL 2');
  await h.click('saveStructure');
  assert.ok(Object.values(h.rowInputs(group.items[0])).every(i=>!i.disabled));
  assert.ok(Object.values(h.rowInputs(group.items[1])).every(i=>i.disabled));
  assert.match(h.nodes.structureGroups.innerHTML,/value="LEVEL 2"/);
  assert.equal(h.nodes.structureDirty.hidden,false);assert.equal(h.nodes.saveStructure.disabled,false);
});

test('view access and baseline locking cannot be bypassed with Edit events',async()=>{
  const group=M.newGroup('STRUCTURAL');group.share=100;group.items=[M.newItem('A')];group.items[0].weight=100;
  for(const opts of [{canManage:false,status:'DRAFT'},{canManage:true,status:'BASELINED'}]){
    const h=await harness({canManage:opts.canManage,saved:{groups:[group],status:opts.status,revision:1,baseline_version:1}});
    assert.doesNotMatch(h.nodes.structureGroups.innerHTML,/data-edit-item=|data-edit-group=/);
    await h.editItem(group,group.items[0]);await h.editGroup(group);
    await h.input(group,group.items[0],'weight','50');await h.groupInput(group,'50');
    assert.ok(Object.values(h.rowInputs(group.items[0])).every(i=>i.disabled));
    assert.equal(h.nodes.structureDirty.hidden,true);assert.equal(h.nodes.scopeWeight.textContent,'100.00%');
  }
});

test('adding a work item opens only the new row for entry',async()=>{
  const group=M.newGroup('STRUCTURAL');group.share=100;group.items=[M.newItem('EXCAVATION')];group.items[0].weight=100;
  const h=await harness({saved:{groups:[group],status:'DRAFT',revision:1,baseline_version:1}});
  await h.action({addItem:group.id});
  assert.ok(Object.values(h.rowInputs(group.items[0])).every(i=>i.disabled));
  const newId=[...h.nodes.structureGroups.innerHTML.matchAll(/<tr[^>]*data-item="([^"]+)"/g)][1][1];
  assert.ok(Object.values(h.rowInputs({id:newId})).every(i=>!i.disabled));
  assert.equal(h.nodes.saveStructure.disabled,false);
});
