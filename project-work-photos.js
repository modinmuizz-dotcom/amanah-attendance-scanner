(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AmanahWorkPhotos = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';
  const TABLE = 'project_work_item_photos', BUCKET = 'project-work-evidence';
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = (group, item) => group + '/' + item;
  function checkFile(file) {
    if (!file || !TYPES.includes(file.type)) throw new Error('Choose JPG, PNG or WebP photos.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Each selected photo must be no larger than 10 MB.');
  }
  async function preparePhoto(file) {
    checkFile(file);
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
      file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) :
      [82,73,70,70].every((b,i) => bytes[i] === b) && [87,69,66,80].every((b,i) => bytes[i+8] === b);
    if (!valid) throw new Error('This file is not a supported photo. Choose a valid JPG, PNG or WebP image.');
    let image, url;
    try {
      if (root.createImageBitmap) image = await root.createImageBitmap(file);
      else {
        url = root.URL.createObjectURL(file);
        image = await new Promise((resolve,reject) => {const img = new root.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Photo could not be opened.'));img.src=url;});
      }
      const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
      if (!width || !height || width * height > 60000000) throw new Error('This photo is too large to process. Choose a smaller image.');
      const scale = Math.min(1, 2400 / Math.max(width, height));
      const canvas = root.document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const ctx = canvas.getContext('2d');if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.85));
      if (!blob || blob.size > 5*1024*1024) throw new Error('This photo could not be reduced below 5 MB. Choose a smaller image.');
      return blob;
    } finally { image?.close?.();if (url) root.URL.revokeObjectURL(url); }
  }
  function createStore(client, {prepare = preparePhoto, uuid = () => root.crypto.randomUUID()} = {}) {
    const bucket = () => client.storage.from(BUCKET);
    const fields = 'photo_id,project_id,group_id,item_id,object_path,caption,is_ready,created_at,actor_label';
    const scoped = (query, context) => query.eq('project_id',context.projectId).eq('group_id',context.groupId).eq('item_id',context.itemId);
    async function inspect(id, context) {
      const r = await scoped(client.from(TABLE).select(fields).eq('photo_id',id),context).maybeSingle();
      if (r.error) throw r.error;return r.data;
    }
    async function remove(row) {
      const file = await bucket().remove([row.object_path]);if (file.error) throw file.error;
      const record = await client.from(TABLE).delete().eq('photo_id',row.photo_id).select('photo_id');
      if (record.error) throw record.error;
      if (!record.data?.length) throw new Error('Photo removal could not be confirmed. Reload photos before retrying.');
    }
    async function uploadOne(context, file, caption) {
      const id = uuid();
      let attempted = false;
      try {
        const blob = await prepare(file);
        if (!blob?.size || blob.size>5242880 || !TYPES.includes(blob.type)) throw new Error('The processed photo is invalid.');
        attempted = true;
        const reservation = await client.from(TABLE).insert({photo_id:id,project_id:context.projectId,group_id:context.groupId,item_id:context.itemId,caption,mime_type:blob.type,byte_size:blob.size}).select(fields).single();
        if (reservation.error) throw reservation.error;
        const row = reservation.data;
        if (!row?.object_path || row.photo_id!==id || row.project_id!==context.projectId || row.group_id!==context.groupId || row.item_id!==context.itemId) throw new Error('Upload reservation could not be confirmed.');
        const result = await bucket().upload(row.object_path,blob,{contentType:blob.type,upsert:false,cacheControl:'600'});
        if (result.error) throw result.error;
        const complete = await client.from(TABLE).update({is_ready:true}).eq('photo_id',id).select(fields).single();
        if (complete.error) throw complete.error;
        if (!complete.data?.is_ready) throw new Error('Upload completion could not be confirmed.');
        return complete.data;
      } catch (error) {
        if (!attempted) throw error;
        // A lost response can follow a successful commit. Verify before cleaning anything up.
        let existing;
        try { existing=await inspect(id,context); } catch { throw new Error('Upload status is uncertain. Reload photos before uploading again.'); }
        if (existing?.is_ready) return existing;
        if (existing) {try {await remove(existing);} catch {throw new Error('An incomplete upload remains. Reload photos and remove it before retrying.');}}
        throw error;
      }
    }
    return {
      async counts(projectId) {
        const r=await client.rpc('amanah_project_work_photo_counts',{p_project_id:projectId});if(r.error)throw r.error;
        return new Map((r.data||[]).map(row=>[key(row.group_id,row.item_id),Number(row.photo_count)]));
      },
      async list(context) {
        const r=await scoped(client.from(TABLE).select(fields),context).order('created_at',{ascending:false}).limit(20);
        if(r.error)throw r.error;
        const rows=r.data||[],paths=rows.filter(row=>row.is_ready).map(row=>row.object_path);
        const signed=paths.length?await bucket().createSignedUrls(paths,600):{data:[]};
        if(signed.error)throw signed.error;
        const urls=new Map((signed.data||[]).map(row=>[row.path,row.error?null:row.signedUrl]));
        return rows.map(row=>({...row,url:urls.get(row.object_path)||null}));
      },
      async upload(context, files, caption='', progress=()=>{}) {
        if(!context.canManage)throw new Error('Engineer or project-management access is required.');
        if(!files.length||files.length>5)throw new Error('Choose between 1 and 5 photos per upload.');
        files.forEach(checkFile);caption=String(caption).trim();if(caption.length>250)throw new Error('The photo note must be no longer than 250 characters.');
        const saved=[],failed=[];
        for(let i=0;i<files.length;i++){
          progress(i+1,files.length);
          try {saved.push(await uploadOne(context,files[i],caption));}
          catch(error){failed.push({file:files[i],message:error.message||'Photo upload failed.'});}
        }
        return{saved,failed};
      },
      remove
    };
  }
  function create({client,onChanged=()=>{},confirm=async()=>false}) {
    const $=id=>root.document.getElementById(id),store=createStore(client),dialog=$('workPhotosDialog');
    let context=null,rows=[],files=[],previews=[],busy=false,generation=0;
    const date=value=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' PHT';
    function status(text='',error=false){$('workPhotosMessage').textContent=text;$('workPhotosMessage').hidden=!text;$('workPhotosMessage').classList.toggle('error',error);}
    function controls(){
      $('workPhotosUpload').disabled=busy||!files.length;
      $('workPhotosChoose').disabled=busy;$('workPhotosFiles').disabled=busy;$('workPhotosCaption').disabled=busy;
      $('workPhotosClose').disabled=busy;$('workPhotosReload').disabled=busy;
      $('workPhotosGallery').querySelectorAll('button').forEach(button=>button.disabled=busy);
      $('workPhotosPreview').querySelectorAll('button').forEach(button=>button.disabled=busy);
      $('workPhotosUpload').textContent=busy?'Saving…':'Upload photos';
    }
    function releasePreviews(){previews.forEach(url=>root.URL.revokeObjectURL(url));previews=[];}
    function preview(){
      releasePreviews();previews=files.map(file=>root.URL.createObjectURL(file));
      $('workPhotosPreview').innerHTML=previews.map((url,i)=>'<div><img src="'+esc(url)+'" alt="Selected photo '+(i+1)+'"><button type="button" class="ps-photo-unselect" data-photo-unselect="'+i+'" aria-label="Remove selected photo '+(i+1)+'" title="Remove selected photo '+(i+1)+'">×</button><span>Photo '+(i+1)+'</span></div>').join('');
      $('workPhotosSelected').textContent=files.length?files.length+' photo'+(files.length===1?'':'s')+' selected':'No photos selected';controls();
    }
    function showGallery(){
      $('workPhotosViewer').hidden=true;$('workPhotosGallery').hidden=false;
      $('workPhotosFull').removeAttribute('src');
      $('workPhotosGallery').innerHTML=rows.length?rows.map((row,i)=>'<article class="ps-photo-card">'+
        (row.is_ready&&row.url?'<button class="ps-photo-image" type="button" data-photo-view="'+i+'" aria-label="View photo '+(i+1)+'"><img loading="lazy" src="'+esc(row.url)+'" alt="Photo evidence for '+esc(context.itemName)+'"></button>':'<div class="ps-photo-unavailable">'+(row.is_ready?'Image unavailable. Reload photos.':'Incomplete upload')+'</div>')+
        '<div class="ps-photo-meta"><strong>'+(row.is_ready?'Photo evidence':'Incomplete upload')+'</strong><small>'+esc(date(row.created_at))+'</small><small>Uploaded by '+esc(row.actor_label)+'</small>'+(row.caption?'<p>'+esc(row.caption)+'</p>':'')+
        (context.canManage?'<button type="button" class="ps-button danger" data-photo-remove="'+i+'">Remove</button>':'')+'</div></article>').join(''):'<p class="ps-note">No photo evidence attached to this work item yet.</p>';
      $('workPhotosCount').textContent=rows.filter(row=>row.is_ready).length+' / 20 photos';controls();
    }
    async function load(){
      const token=++generation,captured=context;
      $('workPhotosGallery').innerHTML='<p class="ps-note">Loading photo evidence…</p>';
      try{const result=await store.list(captured);if(token!==generation)return;rows=result;showGallery();}
      catch{if(token===generation){rows=[];$('workPhotosGallery').innerHTML='<p class="ps-note">Photo evidence could not be loaded. Use Reload photos to try again.</p>';status('Unable to load photo evidence.',true);}}
    }
    function reset(){generation++;context=null;rows=[];files=[];releasePreviews();$('workPhotosFull').removeAttribute('src');$('workPhotosGallery').innerHTML='';$('workPhotosPreview').innerHTML='';if(dialog.open)dialog.close();}
    $('workPhotosClose').addEventListener('click',()=>{if(!busy)dialog.close();});
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{generation++;releasePreviews();$('workPhotosFull').removeAttribute('src');});
    $('workPhotosReload').addEventListener('click',()=>{if(!busy){status();load();}});
    $('workPhotosChoose').addEventListener('click',()=>$('workPhotosFiles').click());
    $('workPhotosFiles').addEventListener('change',()=>{
      const chosen=Array.from($('workPhotosFiles').files||[]);
      try{if(chosen.length>5)throw new Error('Choose up to 5 photos per upload.');chosen.forEach(checkFile);files=chosen;status();preview();}
      catch(error){files=[];$('workPhotosFiles').value='';preview();status(error.message,true);}
    });
    $('workPhotosPreview').addEventListener('click',event=>{
      const button=event.target.closest('[data-photo-unselect]');
      if(!button||busy||!context?.canManage)return;
      const index=Number(button.dataset.photoUnselect);
      if(!Number.isInteger(index)||index<0||index>=files.length)return;
      files.splice(index,1);$('workPhotosFiles').value='';status();preview();
      const next=$('workPhotosPreview').querySelector('[data-photo-unselect="'+Math.min(index,files.length-1)+'"]');
      (next||$('workPhotosChoose')).focus();
    });
    $('workPhotosUpload').addEventListener('click',async()=>{
      if(busy||!context?.canManage||!files.length)return;
      const captured=context;busy=true;controls();const token=generation;
      try{
        const result=await store.upload(captured,files,$('workPhotosCaption').value,(i,total)=>{if(token===generation)status('Uploading photo '+i+' of '+total+'…');});
        if(token!==generation)return;
        files=result.failed.map(f=>f.file);$('workPhotosFiles').value='';preview();
        const feedback=result.saved.length+' photo'+(result.saved.length===1?'':'s')+' uploaded.'+(result.failed.length?' '+result.failed.length+' could not be saved. '+result.failed[0].message:'');
        status(feedback,!!result.failed.length);if(!files.length)$('workPhotosCaption').value='';
        await load();onChanged(captured.projectId);
      }catch(error){if(token===generation)status(error.message||'Photo upload failed. Please retry.',true);}
      finally{busy=false;controls();}
    });
    $('workPhotosGallery').addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button||busy)return;
      if(button.dataset.photoView!==undefined){
        const row=rows[Number(button.dataset.photoView)];if(!row?.url)return;
        $('workPhotosFull').src=row.url;$('workPhotosFull').alt='Photo evidence for '+context.itemName;
        $('workPhotosFullCaption').textContent=row.caption||context.itemName;
        $('workPhotosGallery').hidden=true;$('workPhotosViewer').hidden=false;
      }else if(button.dataset.photoRemove!==undefined&&context?.canManage){
        const row=rows[Number(button.dataset.photoRemove)],captured=context;if(!row)return;
        if(!await confirm('Remove photo evidence?','Remove this photo from '+captured.itemName+'?'))return;
        busy=true;controls();
        try{await store.remove(row);status('Photo evidence removed.');await load();onChanged(captured.projectId);}
        catch{status('Photo removal could not be completed. Reload photos before retrying.',true);}
        finally{busy=false;controls();}
      }
    });
    $('workPhotosBack').addEventListener('click',showGallery);
    return{counts:store.counts,reset,open(next){
      reset();context={...next};files=[];busy=false;$('workPhotosFiles').value='';$('workPhotosCaption').value='';status();preview();
      $('workPhotosTitle').textContent='Photo evidence · '+next.itemName;
      $('workPhotosContext').textContent=next.projectName+' · '+next.groupName;
      $('workPhotosForm').hidden=!next.canManage;$('workPhotosViewer').hidden=true;$('workPhotosGallery').hidden=false;$('workPhotosCount').textContent='';
      dialog.showModal();load();
    }};
  }
  return{create,createStore,preparePhoto,checkFile,key,BUCKET,TABLE};
});
