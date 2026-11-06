const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const P=require('../project-work-photos.js');
const root=path.resolve(__dirname,'..');
const context={projectId:'School / One',projectName:'School <One>',groupId:'11111111-1111-4111-8111-111111111111',groupName:'Structural',itemId:'22222222-2222-4222-8222-222222222222',itemName:'Excavation <test>',canManage:true};
const photo=()=>new Blob([new Uint8Array([255,216,255,224,0,0,0,0])],{type:'image/jpeg'});
function clientHarness(options={}){
  const records=new Map(),objects=new Map(),calls=[];let updateFailures=options.updateFailures||0;
  class Query{
    constructor(){this.filters={};this.operation='select';}
    select(){return this;}
    insert(value){this.operation='insert';this.value=value;return this;}
    update(value){this.operation='update';this.value=value;return this;}
    delete(){this.operation='delete';return this;}
    eq(k,v){this.filters[k]=v;return this;}
    order(){return this;}
    limit(){return this.run();}
    single(){return this.run('single');}
    maybeSingle(){return this.run('single');}
    then(resolve,reject){return this.run().then(resolve,reject);}
    async run(shape){
      calls.push({operation:this.operation,filters:this.filters,value:this.value});
      const matches=()=>[...records.values()].filter(r=>Object.entries(this.filters).every(([k,v])=>r[k]===v));
      if(this.operation==='insert'){
        if(options.insertError)return{data:null,error:new Error('Reservation failed')};
        const row={...this.value,object_path:'uploader/'+this.value.photo_id+'.jpg',is_ready:false,created_at:'2026-11-06T01:00:00Z',actor_label:'Test engineer'};records.set(row.photo_id,row);return{data:{...row},error:null};
      }
      if(this.operation==='update'){
        const row=matches()[0];if(!row)return{data:null,error:new Error('Missing record')};
        if(options.updateCommitsBeforeError||!updateFailures)Object.assign(row,this.value);
        if(updateFailures){updateFailures--;return{data:null,error:new Error('Lost completion response')};}
        return{data:{...row},error:null};
      }
      if(this.operation==='delete'){
        const rows=matches();rows.forEach(row=>records.delete(row.photo_id));return{data:rows.map(row=>({photo_id:row.photo_id})),error:null};
      }
      if(options.inspectError&&shape==='single')return{data:null,error:new Error('Read unavailable')};
      if(options.listHook&&shape!=='single')return await options.listHook(this.filters);
      const rows=matches().map(row=>({...row}));return{data:shape==='single'?(rows[0]||null):rows,error:null};
    }
  }
  const client={
    from:table=>{assert.equal(table,P.TABLE);return new Query();},
    rpc:async(name,args)=>{assert.equal(name,'amanah_project_work_photo_counts');const counts=new Map();for(const row of records.values())if(row.project_id===args.p_project_id&&row.is_ready){const k=P.key(row.group_id,row.item_id);const count=counts.get(k)||{group_id:row.group_id,item_id:row.item_id,photo_count:0};count.photo_count++;counts.set(k,count);}return{data:[...counts.values()],error:null};},
    storage:{from:bucket=>{assert.equal(bucket,P.BUCKET);return{
      upload:async(name,blob,settings)=>{calls.push({operation:'upload',name,settings});if(options.uploadWait)await options.uploadWait;if(options.uploadError)return{error:new Error('Upload rejected')};objects.set(name,blob);return{data:{path:name},error:null};},
      remove:async names=>{calls.push({operation:'removeFile',names});if(options.removeError)return{error:new Error('Remove failed')};names.forEach(name=>objects.delete(name));return{data:[],error:null};},
      createSignedUrls:async(names,expires)=>{calls.push({operation:'sign',names,expires});return{data:names.map(name=>({path:name,...(objects.has(name)?{signedUrl:'https://test.supabase.co/storage/v1/object/sign/'+P.BUCKET+'/'+name+'?token=test'}:{error:'Missing object'})})),error:null};}
    };}}
  };
  let next=0;const store=P.createStore(client,{prepare:options.prepare|| (async()=>photo()),uuid:()=> 'photo-'+(++next)});
  return{client,records,objects,calls,store};
}
test('evidence upload reserves its exact project/group/item before a private non-overwriting upload, then finalizes it',async()=>{
  const h=clientHarness(),r=await h.store.upload(context,[photo()],'  Footing inspection  ');
  assert.equal(r.saved.length,1);assert.equal(r.failed.length,0);
  const inserted=h.calls.find(x=>x.operation==='insert').value;
  assert.equal(inserted.project_id,context.projectId);assert.equal(inserted.group_id,context.groupId);assert.equal(inserted.item_id,context.itemId);assert.equal(inserted.caption,'Footing inspection');
  assert.equal(inserted.is_ready,undefined);assert.equal(inserted.object_path,undefined);
  assert.deepEqual(h.calls.slice(0,3).map(x=>x.operation),['insert','upload','update']);
  assert.equal(h.calls[1].settings.upsert,false);assert.equal(h.records.get('photo-1').is_ready,true);
});
test('failed file uploads remove the stored object before deleting the pending reservation',async()=>{
  const h=clientHarness({uploadError:true}),r=await h.store.upload(context,[photo()]);
  assert.equal(r.saved.length,0);assert.equal(r.failed.length,1);assert.equal(h.records.size,0);
  assert.ok(h.calls.findIndex(x=>x.operation==='removeFile')<h.calls.findIndex(x=>x.operation==='delete'));
});
test('lost completion responses do not delete an already finalized photo',async()=>{
  const h=clientHarness({updateFailures:1,updateCommitsBeforeError:true}),r=await h.store.upload(context,[photo()]);
  assert.equal(r.saved.length,1);assert.equal(h.objects.size,1);assert.ok(!h.calls.some(x=>x.operation==='removeFile'));
});
test('uncertain status and incomplete cleanup retain a recoverable pending upload',async()=>{
  for(const options of [{uploadError:true,removeError:true},{uploadError:true,inspectError:true}]){
    const h=clientHarness(options),r=await h.store.upload(context,[photo()]);
    assert.equal(r.failed.length,1);assert.equal(h.records.size,1);assert.equal(h.records.get('photo-1').is_ready,false);assert.ok(!h.calls.some(x=>x.operation==='delete'));
  }
});
test('view-only access, oversized batches/files and unsupported formats fail before reservation',async()=>{
  const h=clientHarness();
  await assert.rejects(h.store.upload({...context,canManage:false},[photo()]),/access is required/);
  await assert.rejects(h.store.upload(context,Array(6).fill(photo())),/1 and 5/);
  await assert.rejects(h.store.upload(context,[new Blob(['test'],{type:'application/pdf'})]),/JPG/);
  await assert.rejects(h.store.upload(context,[{type:'image/jpeg',size:11*1024*1024}]),/10 MB/);
  assert.equal(h.calls.length,0);
});
test('invalid photo content is rejected before any database call',async()=>{
  const h=clientHarness({prepare:P.preparePhoto});
  const r=await h.store.upload(context,[new Blob(['not a JPEG'],{type:'image/jpeg'})]);
  assert.equal(r.saved.length,0);assert.match(r.failed[0].message,/not a supported photo/);assert.equal(h.calls.length,0);
});
test('each item gallery and counts are isolated, and only finalized photos receive expiring URLs',async()=>{
  const h=clientHarness();await h.store.upload(context,[photo(),photo()]);await h.store.upload({...context,itemId:'other-item'},[photo()]);
  h.records.set('pending',{...h.records.get('photo-1'),photo_id:'pending',object_path:'uploader/pending.jpg',is_ready:false});
  const rows=await h.store.list(context);assert.equal(rows.length,3);assert.equal(rows.filter(row=>row.url).length,2);
  assert.equal(h.calls.at(-1).expires,600);assert.equal(h.calls.at(-1).names.length,2);
  const counts=await h.store.counts(context.projectId);assert.equal(counts.get(P.key(context.groupId,context.itemId)),2);
  assert.equal((await h.store.list({...context,projectId:'unrelated'})).length,0);
});
test('successful removal deletes both file and evidence metadata',async()=>{
  const h=clientHarness();const r=await h.store.upload(context,[photo()]);await h.store.remove(r.saved[0]);assert.equal(h.records.size,0);assert.equal(h.objects.size,0);
});

class Element{
  constructor(){this.listeners={};this.innerHTML='';this.textContent='';this.hidden=false;this.disabled=false;this.value='';this.files=[];this.open=false;this.classList={toggle(){}};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  async emit(name,event={}){for(const fn of this.listeners[name]||[])await fn(event);}
  querySelectorAll(){return[];}
  removeAttribute(name){delete this[name];}
  showModal(){this.open=true;}
  close(){this.open=false;this.emit('close');}
  click(){return this.emit('click');}
}
async function uiHarness(options={}){
  const h=clientHarness(options),ids=[...fs.readFileSync(path.join(root,'project-structure.html'),'utf8').matchAll(/id="(workPhotos[^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length);const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const revoked=[],drawn=[];let urlId=0;
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){drawn.push(args);}}),toBlob:fn=>fn(photo())};
  const browser={document:{getElementById:id=>nodes[id],createElement:()=>canvas},URL:{createObjectURL:()=> 'blob:test/'+(++urlId),revokeObjectURL:url=>revoked.push(url)},crypto:{randomUUID:()=> 'ui-photo-'+(++urlId)},createImageBitmap:async()=>({width:4800,height:3200,close(){}})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'project-work-photos.js'),'utf8'),{window:browser,Blob,Uint8Array,Map,Date,console});
  const changes=[];let confirmations=0;
  const gallery=browser.AmanahWorkPhotos.create({client:h.client,onChanged:id=>changes.push(id),confirm:async()=>{confirmations++;return options.confirm!==false;}});
  const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
  gallery.open(context);await flush();
  return{...h,nodes,gallery,changes,revoked,canvas,drawn,flush,confirmations:()=>confirmations,choose:async files=>{nodes.workPhotosFiles.files=files;await nodes.workPhotosFiles.emit('change');},click:async(id,event)=>{await nodes[id].emit('click',event);await flush();}};
}
test('engineer upload UI previews, resizes and saves photos without changing the scope',async()=>{
  const h=await uiHarness();await h.choose([photo()]);assert.equal(h.nodes.workPhotosUpload.disabled,false);assert.match(h.nodes.workPhotosPreview.innerHTML,/Selected photo 1/);
  h.nodes.workPhotosCaption.value='<inspection note>';await h.click('workPhotosUpload');
  assert.equal(h.records.size,1);assert.equal([...h.records.values()][0].is_ready,true);assert.equal(h.canvas.width,2400);assert.equal(h.canvas.height,1600);
  assert.deepEqual(h.changes,[context.projectId]);assert.match(h.nodes.workPhotosGallery.innerHTML,/&lt;inspection note&gt;/);assert.doesNotMatch(h.nodes.workPhotosGallery.innerHTML,/<inspection note>/);
  assert.equal(h.nodes.workPhotosCount.textContent,'1 / 20 photos');assert.equal(h.nodes.workPhotosUpload.disabled,true);
});
test('viewers can browse photos but cannot upload or remove them',async()=>{
  const h=await uiHarness();await h.store.upload(context,[photo()]);h.gallery.open({...context,canManage:false});await h.flush();
  assert.equal(h.nodes.workPhotosForm.hidden,true);assert.match(h.nodes.workPhotosGallery.innerHTML,/data-photo-view/);assert.doesNotMatch(h.nodes.workPhotosGallery.innerHTML,/data-photo-remove/);
  const count=h.records.size;await h.click('workPhotosUpload');assert.equal(h.records.size,count);
});
test('remove requires confirmation and closing a gallery releases preview resources',async()=>{
  const h=await uiHarness({confirm:false});await h.store.upload(context,[photo()]);h.gallery.open(context);await h.flush();
  await h.click('workPhotosGallery',{target:{closest:()=>({dataset:{photoRemove:'0'}})}});assert.equal(h.confirmations(),1);assert.equal(h.records.size,1);
  await h.choose([photo()]);await h.click('workPhotosClose');assert.ok(h.revoked.length>0);assert.equal(h.nodes.workPhotosDialog.open,false);
});
test('upload controls and dialog dismissal are guarded while a photo is being saved',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const h=await uiHarness({uploadWait:pending});await h.choose([photo()]);
  const saving=h.click('workPhotosUpload');await h.flush();assert.equal(h.nodes.workPhotosClose.disabled,true);assert.equal(h.nodes.workPhotosChoose.disabled,true);
  let prevented=false;await h.nodes.workPhotosDialog.emit('cancel',{preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);
  resolve();await saving;assert.equal(h.nodes.workPhotosClose.disabled,false);
});
