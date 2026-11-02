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
  querySelector(){return null;}
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
      if(name==='amanah_project_structure_get')return{data:{project,structure:saved,events:[],can_manage:canManage},error:null};
      if(options.writeError)return{data:null,error:options.writeError};
      assert.equal(name,'amanah_project_structure_write');
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
  return{nodes,calls,redirects,saved:()=>saved,flush,click:async id=>{await nodes[id].emit('click');await flush();},input:async(group,item,field,value)=>nodes.structureGroups.emit('input',{target:{dataset:{field},value,closest:selector=>selector==='[data-group]'?{dataset:{group:group.id}}:{dataset:{item:item.id}}}})};
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
  const items=groups.flatMap(g=>g.items.map(item=>({group:g,item})));
  const base=Math.floor(10000/items.length);
  for(let i=0;i<items.length;i++)await h.input(items[i].group,items[i].item,'weight',String((i===items.length-1?10000-base*i:base)/100));
  assert.equal(h.nodes.scopeWeight.textContent,'100.00%');
  assert.equal(h.nodes.baselineStructure.disabled,true,'Unsaved weights must not activate a baseline');
  await h.click('saveStructure');
  assert.equal(h.saved().revision,2);assert.equal(h.nodes.baselineStructure.disabled,false);
  await h.click('baselineStructure');
  assert.equal(h.saved().status,'BASELINED');assert.equal(h.nodes.saveStructure.hidden,true);
  assert.equal(h.nodes.reopenStructure.hidden,false);assert.match(h.nodes.structureGroups.innerHTML,/ disabled/);
  await h.click('reopenStructure');
  assert.equal(h.saved().status,'DRAFT');assert.equal(h.saved().baseline_version,2);
  assert.equal(h.calls.at(-2).params.p_reason,'Revise the agreed work allocation');
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
