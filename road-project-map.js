(function(){
  const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  let map=null;
  let drawnItems=null;
  let projectData={project:null,phases:[],sections:[],components:[]};
  let drawMode=null;
  let mapCenterMode=false;
  let pointMode=null;
  let centerMarker=null;
  let pointLayer=null;
  let statusLayer=null;

  const qs=id=>document.getElementById(id);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");

  function stationLabel(value){
    if(value===null||value===undefined||value==='') return '—';
    const n=Number(value);
    if(!Number.isFinite(n)) return String(value);
    const km=Math.floor(Math.abs(n)/1000), rem=Math.abs(n)-km*1000;
    return 'STA '+(n<0?'-':'')+km+'+'+rem.toFixed(3).padStart(7,'0');
  }

  function statusColor(status){
    switch(String(status||'PLANNED').toUpperCase()){
      case 'DONE': return '#16a34a';
      case 'IN PROGRESS': return '#ea580c';
      case 'NOT DONE':
      case 'CANCELLED': return '#dc2626';
      case 'ON HOLD': return '#7c3aed';
      default: return '#2563eb';
    }
  }

  function clearMapLayers(){
    if(drawnItems) drawnItems.clearLayers();
    if(statusLayer){statusLayer.clearLayers();} 
    if(centerMarker){centerMarker.remove();centerMarker=null;}
    if(pointLayer){pointLayer.clearLayers();}
  }

  function featureLine(coords,style,props){
    if(!coords||coords.length<2)return null;
    const line=L.polyline(coords.map(c=>[c[1],c[0]]),style);
    line.bindPopup('<strong>'+esc(props.title)+'</strong><br>'+esc(props.subtitle||'')+(props.station?'<br>'+esc(props.station):''));
    return line;
  }

  function renderLayers(){
    clearMapLayers();
    if(!statusLayer)statusLayer=L.layerGroup().addTo(map);

    projectData.sections.forEach(s=>{
      if(s.start_lat!=null && s.start_lng!=null){
        const m=L.marker([Number(s.start_lat),Number(s.start_lng)],{title:'Start Point'}).addTo(statusLayer);
        m.bindPopup('<strong>START POINT</strong><br>'+esc(s.section_code+' — '+s.section_name)+'<br>Lat '+esc(Number(s.start_lat).toFixed(6))+' • Lng '+esc(Number(s.start_lng).toFixed(6))+'<br>'+esc(stationLabel(s.station_start_m)));
      }
      if(s.end_lat!=null && s.end_lng!=null){
        const m=L.marker([Number(s.end_lat),Number(s.end_lng)],{title:'End Point'}).addTo(statusLayer);
        m.bindPopup('<strong>END POINT</strong><br>'+esc(s.section_code+' — '+s.section_name)+'<br>Lat '+esc(Number(s.end_lat).toFixed(6))+' • Lng '+esc(Number(s.end_lng).toFixed(6))+'<br>'+esc(stationLabel(s.station_end_m)));
      }
    });

    projectData.sections.forEach(s=>{
      if(!s.geometry?.coordinates)return;
      const line=featureLine(s.geometry.coordinates,{color:'#0f172a',weight:7,opacity:.45},{
        title:s.section_code+' — '+s.section_name,
        subtitle:'ROAD SECTION • '+String(s.status||'PLANNED').toUpperCase(),
        station:stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m)
      });
      if(line)line.addTo(statusLayer);
    });

    projectData.components.forEach(c=>{
      if(!c.geometry?.coordinates)return;
      const line=featureLine(c.geometry.coordinates,{color:statusColor(c.status),weight:8,opacity:.88},{
        title:c.component_name,
        subtitle:(c.component_type||'WORK COMPONENT')+' • '+(c.component_side||'NONE')+' • '+(c.status||'PLANNED'),
        station:stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m)
      });
      if(line)line.addTo(statusLayer);
    });

    if(projectData.project?.project_details){
      const d=projectData.project.project_details||{};
      if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
        centerMarker=L.marker([Number(d.map_lat),Number(d.map_lng)]).addTo(statusLayer).bindPopup('<strong>PROJECT MAP CENTER</strong><br>'+esc(projectData.project.project_name||''));
        if(!map.getBounds().isValid()) map.setView([Number(d.map_lat),Number(d.map_lng)],Number(d.map_zoom)||16);
      }
    }
    updateMapSummary();
  }

  function allGeometryBounds(){
    const bounds=[];
    projectData.sections.forEach(s=>{
      s.geometry?.coordinates?.forEach(c=>bounds.push([c[1],c[0]]));
      if(s.start_lat!=null&&s.start_lng!=null)bounds.push([Number(s.start_lat),Number(s.start_lng)]);
      if(s.end_lat!=null&&s.end_lng!=null)bounds.push([Number(s.end_lat),Number(s.end_lng)]);
    });
    projectData.components.forEach(c=>c.geometry?.coordinates?.forEach(p=>bounds.push([p[1],p[0]])));
    return bounds;
  }

  function updateMapSummary(){
    const nSections=projectData.sections.filter(s=>s.geometry).length;
    const nComponents=projectData.components.filter(c=>c.geometry).length;
    const el=qs('roadMapSummary');
    if(el)el.textContent=nSections+' section alignment'+(nSections===1?'':'s')+' • '+nComponents+' component line'+(nComponents===1?'':'s');
  }

  function populateTargets(){
    const targetType=qs('mapTargetType').value;
    const target=qs('mapTarget');
    const label=qs('mapTargetLabel');
    if(targetType==='SECTION'){
      if(label)label.textContent='SELECT ROAD SECTION';
      target.innerHTML='<option value="">SELECT ROAD SECTION</option>'+projectData.sections.map(s=>'<option value="'+esc(s.section_id)+'">'+esc(s.section_code+' — '+s.section_name)+' • '+esc(stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m))+'</option>').join('');
      return;
    }
    if(label)label.textContent='SELECT WORK COMPONENT';
    target.innerHTML='<option value="">SELECT WORK COMPONENT</option>'+projectData.components.map(c=>'<option value="'+esc(c.work_component_id)+'">'+esc(c.component_name)+' • '+esc(c.component_side||'NONE')+' • '+esc(stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m))+'</option>').join('');
  }

  async function loadData(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    if(!projectId) throw new Error('Missing project_id.');

    // Load the lightweight project structure directly from Supabase tables.
    // This keeps the map responsive even if the PostGIS aggregation RPC is slow.
    const {data:projectRows,error:projectError}=await client.from('projects')
      .select('project_id,project_name,location,project_type,project_details')
      .eq('project_id',projectId)
      .limit(1);
    if(projectError) throw projectError;
    if(!projectRows?.length) throw new Error('Road project not found.');

    const {data:phases,error:phaseError}=await client.from('project_phases')
      .select('phase_id,project_id,phase_code,phase_name,status,sequence_no')
      .eq('project_id',projectId)
      .order('sequence_no',{ascending:true});
    if(phaseError) throw phaseError;

    const phaseIds=(phases||[]).map(p=>p.phase_id);
    let sections=[];
    if(phaseIds.length){
      const {data,error}=await client.from('project_sections')
        .select('section_id,phase_id,section_code,section_name,station_start_m,station_end_m,route_length_m,status,start_lat,start_lng,end_lat,end_lng')
        .in('phase_id',phaseIds)
        .order('station_start_m',{ascending:true});
      if(error) throw error;
      sections=(data||[]).map(s=>({...s,geometry:null}));
    }

    const sectionIds=sections.map(s=>s.section_id);
    let components=[];
    if(sectionIds.length){
      const {data,error}=await client.from('project_work_components')
        .select('work_component_id,section_id,component_type,component_side,component_name,station_start_m,station_end_m,planned_quantity,quantity_unit,status,is_optional,is_active,sort_order')
        .in('section_id',sectionIds)
        .eq('is_active',true)
        .order('sort_order',{ascending:true});
      if(error) throw error;
      components=(data||[]).map(c=>({...c,geometry:null}));
    }

    projectData={
      project:projectRows[0],
      phases:phases||[],
      sections,
      components
    };

    const projectNameEl=qs('roadMapProjectName');
    if(projectNameEl) projectNameEl.textContent=projectData.project?.project_name||'ROAD PROJECT MAP';
    populateTargets();
    renderLayers();

    const bounds=allGeometryBounds();
    if(bounds.length){
      map.fitBounds(L.latLngBounds(bounds),{padding:[35,35]});
    }else{
      const d=projectData.project?.project_details||{};
      if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
        map.setView([Number(d.map_lat),Number(d.map_lng)],Number(d.map_zoom)||16);
      }else{
        map.setView([7.1907,124.383],13);
      }
    }
    loadGeometryOverlay(projectId);
  }
  async function loadGeometryOverlay(projectId){
    try{
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('MAP_GEOMETRY_TIMEOUT')),3500));
      const request=client.rpc('get_road_project_map_data',{p_project_id:projectId});
      const {data}=await Promise.race([request,timeout]);
      if(!data)return;
      const sectionMap=new Map((data.sections||[]).map(s=>[s.section_id,s.geometry]));
      const componentMap=new Map((data.components||[]).map(c=>[c.work_component_id,c.geometry]));
      projectData.sections=projectData.sections.map(s=>({...s,geometry:sectionMap.get(s.section_id)||null}));
      projectData.components=projectData.components.map(c=>({...c,geometry:componentMap.get(c.work_component_id)||null}));
      renderLayers();
      const bounds=allGeometryBounds();
      if(bounds.length) map.fitBounds(L.latLngBounds(bounds),{padding:[35,35]});
    }catch(_error){}
  }

  function setDrawMessage(text,type='info'){
    const el=qs('roadMapNotice');
    if(!el)return;
    el.textContent=text;
    el.className='road-map-notice '+type;
    el.style.display='block';
  }

  function selectedSection(){
    const id=qs('mapTarget').value;
    if(qs('mapTargetType').value!=='SECTION' || !id)return null;
    return projectData.sections.find(s=>s.section_id===id)||null;
  }

  function setPointMode(kind){
    const section=selectedSection();
    if(!section){
      setDrawMessage('Select MAP TARGET = ROAD SECTION and choose a road section first.','err');
      return;
    }
    pointMode=kind;
    qs('mapStartPoint').classList.toggle('active',kind==='START');
    qs('mapEndPoint').classList.toggle('active',kind==='END');
    setDrawMessage('Click the actual '+kind.toLowerCase()+' point on the map. The coordinate will be saved to '+section.section_code+' — '+section.section_name+'.','info');
  }

  async function saveSectionPoint(section,kind,lat,lng){
    const args={
      p_section_id:section.section_id,
      p_start_lat:kind==='START' ? lat : (section.start_lat==null?null:Number(section.start_lat)),
      p_start_lng:kind==='START' ? lng : (section.start_lng==null?null:Number(section.start_lng)),
      p_end_lat:kind==='END' ? lat : (section.end_lat==null?null:Number(section.end_lat)),
      p_end_lng:kind==='END' ? lng : (section.end_lng==null?null:Number(section.end_lng))
    };
    const {error}=await client.rpc('save_road_section_start_end',args);
    if(error){setDrawMessage(error.message||'Unable to save coordinate.','err');return;}
    setDrawMessage(kind+' point saved at '+lat.toFixed(6)+', '+lng.toFixed(6)+'.','ok');
    pointMode=null;
    qs('mapStartPoint').classList.remove('active');
    qs('mapEndPoint').classList.remove('active');
    await loadData();
  }

  function startLineDrawing(){
    const targetId=qs('mapTarget').value;
    const targetType=qs('mapTargetType').value;
    if(!targetId){setDrawMessage('Select a road section or work component first.','err');return;}
    if(!window.L?.Draw){setDrawMessage('Map drawing tools are not available.','err');return;}
    drawMode={targetType,targetId};
    const drawer=new L.Draw.Polyline(map,{shapeOptions:{color:'#2563eb',weight:5}});
    drawer.enable();
    setDrawMessage('Click points along the actual project alignment, then double-click to finish the line.','info');
  }

  async function saveDrawnGeometry(layer){
    if(!drawMode)return;
    const geojson=layer.toGeoJSON().geometry;
    const rpc=drawMode.targetType==='SECTION'?'save_road_section_geometry':'save_road_work_component_geometry';
    const args=drawMode.targetType==='SECTION'
      ?{p_section_id:drawMode.targetId,p_geojson:geojson}
      :{p_work_component_id:drawMode.targetId,p_geojson:geojson};
    const {error}=await client.rpc(rpc,args);
    if(error){setDrawMessage(error.message||'Unable to save geometry.','err');return;}
    drawMode=null;
    setDrawMessage('Map line saved successfully.','ok');
    await loadData();
  }

  function professionalConfirm(targetType,targetLabel){
    return new Promise(resolve=>{
      const modal=qs('mapConfirmModal');
      const message=qs('mapConfirmMessage');
      const ok=qs('mapConfirmOk');
      const cancel=qs('mapConfirmCancel');
      if(!modal||!ok||!cancel){resolve(window.confirm('Remove the saved map line for this '+targetType.toLowerCase()+'?'));return;}
      message.textContent='Remove the saved map line for '+targetLabel+'? This will remove only the geographic line from the map. The road structure, station range, planned quantity and activity data will remain unchanged.';
      modal.classList.remove('hidden');
      const cleanup=value=>{
        modal.classList.add('hidden');
        ok.removeEventListener('click',onOk);
        cancel.removeEventListener('click',onCancel);
        modal.removeEventListener('click',onBackdrop);
        document.removeEventListener('keydown',onKey);
        resolve(value);
      };
      const onOk=()=>cleanup(true);
      const onCancel=()=>cleanup(false);
      const onBackdrop=e=>{if(e.target===modal)cleanup(false);};
      const onKey=e=>{if(e.key==='Escape')cleanup(false);};
      ok.addEventListener('click',onOk);
      cancel.addEventListener('click',onCancel);
      modal.addEventListener('click',onBackdrop);
      document.addEventListener('keydown',onKey);
      setTimeout(()=>ok.focus(),50);
    });
  }

  async function clearSelectedGeometry(){
    const targetId=qs('mapTarget').value;
    const targetType=qs('mapTargetType').value;
    if(!targetId){setDrawMessage('Select a target first.','err');return;}
    const target=targetType==='SECTION'
      ? projectData.sections.find(x=>x.section_id===targetId)
      : projectData.components.find(x=>x.work_component_id===targetId);
    const targetLabel=target
      ? (targetType==='SECTION'
        ? (target.section_code+' — '+target.section_name)
        : (target.component_name+' • '+(target.component_side||'NONE')))
      : 'this '+targetType.toLowerCase();
    if(!(await professionalConfirm(targetType,targetLabel)))return;
    const rpc=targetType==='SECTION'?'save_road_section_geometry':'save_road_work_component_geometry';
    const args=targetType==='SECTION'?{p_section_id:targetId,p_geojson:null}:{p_work_component_id:targetId,p_geojson:null};
    const {error}=await client.rpc(rpc,args);
    if(error){setDrawMessage(error.message||'Unable to clear geometry.','err');return;}
    setDrawMessage('Saved map line removed successfully.','ok');
    await loadData();
  }

  async function saveMapCenter(lat,lng){
    const projectId=new URLSearchParams(location.search).get('project_id');
    const zoom=map.getZoom();
    const d=projectData.project?.project_details||{};
    const merged={...d,map_lat:lat,map_lng:lng,map_zoom:zoom};
    const {error}=await client.rpc('save_road_project_map_center',{p_project_id:projectId,p_map_lat:lat,p_map_lng:lng,p_map_zoom:zoom,p_project_details:merged});
    if(error){setDrawMessage(error.message||'Unable to save project map center.','err');return;}
    projectData.project.project_details=merged;
    if(centerMarker)centerMarker.remove();
    centerMarker=L.marker([lat,lng]).addTo(statusLayer).bindPopup('<strong>PROJECT MAP CENTER</strong>');
    setDrawMessage('Project map center saved.','ok');
  }

  async function init(){
    const mapEl=qs('roadMap');
    if(!mapEl||!window.L)return;
    map=L.map(mapEl,{zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:20,
      attribution:'© OpenStreetMap contributors'
    }).addTo(map);
    drawnItems=new L.FeatureGroup().addTo(map);
    statusLayer=L.layerGroup().addTo(map);

    qs('mapTargetType').addEventListener('change',populateTargets);
    qs('mapDrawLine').addEventListener('click',startLineDrawing);
    qs('mapClearLine').addEventListener('click',clearSelectedGeometry);
    qs('mapStartPoint').addEventListener('click',()=>setPointMode('START'));
    qs('mapEndPoint').addEventListener('click',()=>setPointMode('END'));
    qs('mapFit').addEventListener('click',()=>{
      const bounds=allGeometryBounds();
      if(bounds.length) map.fitBounds(L.latLngBounds(bounds),{padding:[35,35]});
      else setDrawMessage('No saved geometry yet. Draw the first road alignment line.','info');
    });
    qs('mapSetCenter').addEventListener('click',()=>{
      mapCenterMode=!mapCenterMode;
      qs('mapSetCenter').textContent=mapCenterMode?'CLICK MAP TO SAVE CENTER':'SET MAP CENTER';
      qs('mapSetCenter').classList.toggle('active',mapCenterMode);
      setDrawMessage(mapCenterMode?'Click the map at the actual project location.':'Map center mode cancelled.','info');
    });

    map.on('click',async e=>{
      if(pointMode){
        const section=selectedSection();
        const kind=pointMode;
        if(section) await saveSectionPoint(section,kind,e.latlng.lat,e.latlng.lng);
        return;
      }
      if(mapCenterMode){
        mapCenterMode=false;
        qs('mapSetCenter').textContent='SET MAP CENTER';
        qs('mapSetCenter').classList.remove('active');
        await saveMapCenter(e.latlng.lat,e.latlng.lng);
      }
    });

    map.on(L.Draw.Event.CREATED,async e=>{
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      await saveDrawnGeometry(e.layer);
      drawnItems.clearLayers();
    });

    await loadData();
  }

  window.AMANAHRoadMap={init,refresh:loadData};
})();