(function(){
  const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  let map=null;
  let projectData={project:null,phases:[],sections:[],components:[]};
  let statusLines=[];
  let projectMarker=null;
  let pointMarkers=[];
  let drawLine=null;
  let drawVertices=[];
  let drawState=null;
  let pointMode=null;
  let mapCenterMode=false;
  let apiReady=false;

  const qs=id=>document.getElementById(id);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;');

  function setDrawMessage(text,type='info'){
    const el=qs('roadMapNotice');
    if(!el)return;
    el.textContent=text;
    el.className='road-map-notice '+type;
    el.style.display='block';
  }

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

  function clearRenderedGeometry(){
    statusLines.forEach(x=>x.setMap(null));
    statusLines=[];
    pointMarkers.forEach(x=>x.setMap(null));
    pointMarkers=[];
    if(projectMarker){projectMarker.map=null;projectMarker=null;}
  }

  async function addProjectMarker(position,title){
    try{
      const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
      const marker=new AdvancedMarkerElement({
        map,
        position,
        title,
        gmpDraggable:false
      });
      if(title){
        const info=new google.maps.InfoWindow({content:'<strong>'+esc(title)+'</strong>'});
        marker.addListener('click',()=>info.open({map,anchor:marker}));
      }
      return marker;
    }catch(_){
      return null;
    }
  }

  function coordsToPath(coords){
    return (coords||[]).map(c=>({lat:Number(c[1]),lng:Number(c[0])}));
  }

  function allGeometryBounds(){
    const bounds=new google.maps.LatLngBounds();
    let has=false;
    const addCoords=coords=>{
      (coords||[]).forEach(c=>{bounds.extend({lat:Number(c[1]),lng:Number(c[0])});has=true;});
    };
    projectData.sections.forEach(s=>addCoords(s.geometry?.coordinates));
    projectData.components.forEach(c=>addCoords(c.geometry?.coordinates));
    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
      bounds.extend({lat:Number(d.map_lat),lng:Number(d.map_lng)});
      has=true;
    }
    return has?bounds:null;
  }

  function updateMapSummary(){
    const nSections=projectData.sections.filter(s=>s.geometry).length;
    const nComponents=projectData.components.filter(c=>c.geometry).length;
    const el=qs('roadMapSummary');
    if(el)el.textContent=nSections+' section alignment'+(nSections===1?'':'s')+' • '+nComponents+' component line'+(nComponents===1?'':'s');
  }

  function drawSavedLine(coords,options,props){
    if(!coords||coords.length<2)return null;
    const line=new google.maps.Polyline({
      map,
      path:coordsToPath(coords),
      geodesic:true,
      strokeColor:options.color,
      strokeOpacity:options.opacity,
      strokeWeight:options.weight,
      clickable:true,
      zIndex:options.zIndex||1
    });
    const info=new google.maps.InfoWindow();
    line.addListener('click',e=>{
      info.setContent('<div style="font-size:12px;line-height:1.5"><strong>'+esc(props.title)+'</strong><br>'+esc(props.subtitle||'')+(props.station?'<br>'+esc(props.station):'')+'</div>');
      info.setPosition(e.latLng);
      info.open({map});
    });
    statusLines.push(line);
    return line;
  }

  function renderLayers(){
    if(!map||!apiReady)return;
    clearRenderedGeometry();

    projectData.sections.forEach(s=>{
      if(s.geometry?.coordinates){
        drawSavedLine(s.geometry.coordinates,{color:'#0f172a',weight:6,opacity:.42,zIndex:2},{
          title:(s.section_code||'SECTION')+' — '+(s.section_name||''),
          subtitle:'ROAD SECTION • '+String(s.status||'PLANNED').toUpperCase(),
          station:stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m)
        });
      }
      if(s.start_lat!=null&&s.start_lng!=null){
        const marker=new google.maps.Circle({
          map,center:{lat:Number(s.start_lat),lng:Number(s.start_lng)},
          radius:7,fillColor:'#16a34a',fillOpacity:.95,strokeColor:'#fff',strokeWeight:2,zIndex:8
        });
        pointMarkers.push(marker);
      }
      if(s.end_lat!=null&&s.end_lng!=null){
        const marker=new google.maps.Circle({
          map,center:{lat:Number(s.end_lat),lng:Number(s.end_lng)},
          radius:7,fillColor:'#dc2626',fillOpacity:.95,strokeColor:'#fff',strokeWeight:2,zIndex:8
        });
        pointMarkers.push(marker);
      }
    });

    projectData.components.forEach(c=>{
      if(c.geometry?.coordinates){
        drawSavedLine(c.geometry.coordinates,{color:statusColor(c.status),weight:8,opacity:.88,zIndex:3},{
          title:c.component_name||'WORK COMPONENT',
          subtitle:(c.component_type||'WORK COMPONENT')+' • '+(c.component_side||'NONE')+' • '+(c.status||'PLANNED'),
          station:stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m)
        });
      }
    });

    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
      addProjectMarker({lat:Number(d.map_lat),lng:Number(d.map_lng)},'PROJECT LOCATION').then(m=>{projectMarker=m;});
    }
    updateMapSummary();
  }

  function populateTargets(){
    const type=qs('mapTargetType').value;
    const target=qs('mapTarget');
    const label=qs('mapTargetLabel');
    if(type==='SECTION'){
      if(label)label.textContent='SELECT ROAD SECTION';
      target.innerHTML='<option value="">SELECT ROAD SECTION</option>'+projectData.sections.map(s=>'<option value="'+esc(s.section_id)+'">'+esc(s.section_code+' — '+s.section_name)+' • '+esc(stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m))+'</option>').join('');
    }else{
      if(label)label.textContent='SELECT WORK COMPONENT';
      target.innerHTML='<option value="">SELECT WORK COMPONENT</option>'+projectData.components.map(c=>'<option value="'+esc(c.work_component_id)+'">'+esc(c.component_name)+' • '+esc(c.component_side||'NONE')+' • '+esc(stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m))+'</option>').join('');
    }
  }

  function selectedSection(){
    const id=qs('mapTarget').value;
    if(qs('mapTargetType').value!=='SECTION'||!id)return null;
    return projectData.sections.find(s=>s.section_id===id)||null;
  }

  function setPointMode(kind){
    if(!apiReady)return;
    const section=selectedSection();
    if(!section){setDrawMessage('Select MAP TARGET = ROAD SECTION and choose a road section first.','err');return;}
    cancelDraw(false);
    pointMode=kind;
    mapCenterMode=false;
    const setCenter=qs('mapSetCenter');
    if(setCenter){setCenter.textContent='SET MAP CENTER';setCenter.classList.remove('active');}
    qs('mapStartPoint').classList.toggle('active',kind==='START');
    qs('mapEndPoint').classList.toggle('active',kind==='END');
    setDrawMessage('Click the actual '+kind.toLowerCase()+' point on the map.','info');
  }

  async function saveSectionPoint(section,kind,lat,lng){
    const args={
      p_section_id:section.section_id,
      p_start_lat:kind==='START'?lat:(section.start_lat==null?null:Number(section.start_lat)),
      p_start_lng:kind==='START'?lng:(section.start_lng==null?null:Number(section.start_lng)),
      p_end_lat:kind==='END'?lat:(section.end_lat==null?null:Number(section.end_lat)),
      p_end_lng:kind==='END'?lng:(section.end_lng==null?null:Number(section.end_lng))
    };
    const {error}=await client.rpc('save_road_section_start_end',args);
    if(error){setDrawMessage(error.message||'Unable to save coordinate.','err');return;}
    pointMode=null;
    qs('mapStartPoint').classList.remove('active');
    qs('mapEndPoint').classList.remove('active');
    setDrawMessage(kind+' point saved.','ok');
    await loadData();
  }

  function drawButtonState(active){
    const b=qs('mapDrawLine');
    if(!b)return;
    b.textContent=active?'FINISH DRAW':'DRAW / REPLACE LINE';
    b.classList.toggle('active',active);
  }

  function clearDrawVisuals(){
    if(drawLine){drawLine.setMap(null);drawLine=null;}
    drawVertices.forEach(v=>v.setMap(null));
    drawVertices=[];
  }

  function cancelDraw(silent=true){
    clearDrawVisuals();
    drawState=null;
    drawButtonState(false);
    if(map)map.setOptions({disableDoubleClickZoom:false});
    if(!silent)setDrawMessage('Drawing cancelled.','info');
  }

  function startLineDrawing(){
    if(!apiReady){openGoogleSettings();return;}
    const targetId=qs('mapTarget').value;
    const targetType=qs('mapTargetType').value;
    if(!targetId){setDrawMessage('Select a road section or work component first.','err');return;}
    cancelDraw(true);
    pointMode=null;
    mapCenterMode=false;
    qs('mapStartPoint').classList.remove('active');
    qs('mapEndPoint').classList.remove('active');
    const setCenter=qs('mapSetCenter'); if(setCenter){setCenter.textContent='SET MAP CENTER';setCenter.classList.remove('active');}
    drawState={targetType,targetId,points:[]};
    map.setOptions({disableDoubleClickZoom:true});
    drawButtonState(true);
    setDrawMessage('DRAW MODE: click along the actual road. Double-click or press FINISH DRAW when complete.','info');
  }

  function renderDrawPath(){
    if(!drawState)return;
    clearDrawVisuals();
    drawLine=new google.maps.Polyline({
      map,path:drawState.points,
      geodesic:true,strokeColor:'#2563eb',strokeOpacity:1,strokeWeight:5,zIndex:20
    });
    drawState.points.forEach(p=>{
      drawVertices.push(new google.maps.Circle({
        map,center:p,radius:4.5,fillColor:'#fff',fillOpacity:1,strokeColor:'#2563eb',strokeWeight:2,zIndex:21
      }));
    });
  }

  async function finishDrawing(){
    if(!drawState)return;
    if(drawState.points.length<2){setDrawMessage('Add at least two points before finishing the line.','err');return;}
    const path=drawState.points.map(p=>[Number(p.lng),Number(p.lat)]);
    const rpc=drawState.targetType==='SECTION'?'save_road_section_geometry':'save_road_work_component_geometry';
    const args=drawState.targetType==='SECTION'
      ?{p_section_id:drawState.targetId,p_geojson:{type:'LineString',coordinates:path}}
      :{p_work_component_id:drawState.targetId,p_geojson:{type:'LineString',coordinates:path}};
    setDrawMessage('Saving map line...','info');
    const {error}=await client.rpc(rpc,args);
    if(error){setDrawMessage(error.message||'Unable to save geometry.','err');return;}
    clearDrawVisuals();
    drawState=null;
    drawButtonState(false);
    map.setOptions({disableDoubleClickZoom:false});
    setDrawMessage('Map line saved successfully.','ok');
    await loadData();
  }

  function professionalConfirm(targetType,targetLabel){
    return new Promise(resolve=>{
      const modal=qs('mapConfirmModal'), message=qs('mapConfirmMessage'), ok=qs('mapConfirmOk'), cancel=qs('mapConfirmCancel');
      if(!modal||!ok||!cancel){resolve(window.confirm('Remove the saved map line for this '+targetType.toLowerCase()+'?'));return;}
      message.textContent='Remove the saved map line for '+targetLabel+'? This removes only the geographic line. The road structure, station range, quantities and activity data remain.';
      modal.classList.remove('hidden');
      const cleanup=value=>{
        modal.classList.add('hidden');
        ok.removeEventListener('click',onOk);
        cancel.removeEventListener('click',onCancel);
        modal.removeEventListener('click',onBackdrop);
        document.removeEventListener('keydown',onKey);
        resolve(value);
      };
      const onOk=()=>cleanup(true), onCancel=()=>cleanup(false);
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
    const label=target?(targetType==='SECTION'?(target.section_code+' — '+target.section_name):(target.component_name+' • '+(target.component_side||'NONE'))):'this target';
    if(!(await professionalConfirm(targetType,label)))return;
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
    const {error}=await client.rpc('save_road_project_map_center',{
      p_project_id:projectId,p_map_lat:lat,p_map_lng:lng,p_map_zoom:zoom,p_project_details:merged
    });
    if(error){setDrawMessage(error.message||'Unable to save project map center.','err');return;}
    projectData.project.project_details=merged;
    clearRenderedGeometry();
    renderLayers();
    setDrawMessage('Project map center saved.','ok');
  }

  function setCenterModeToggle(){
    if(!apiReady)return;
    cancelDraw(true);
    pointMode=null;
    qs('mapStartPoint').classList.remove('active');
    qs('mapEndPoint').classList.remove('active');
    mapCenterMode=!mapCenterMode;
    const b=qs('mapSetCenter');
    b.textContent=mapCenterMode?'CLICK MAP TO SAVE CENTER':'SET MAP CENTER';
    b.classList.toggle('active',mapCenterMode);
    setDrawMessage(mapCenterMode?'Click the map at the actual project location.':'Map center mode cancelled.','info');
  }

  function toggleSatellite(){
    if(!map)return;
    const id=map.getMapTypeId();
    const next=id==='satellite'?'roadmap':'satellite';
    map.setMapTypeId(next);
    const b=qs('mapSatellite');
    if(b)b.textContent=next==='satellite'?'ROAD MAP':'SATELLITE';
  }

  function fitProject(){
    if(!map)return;
    const bounds=allGeometryBounds();
    if(bounds){map.fitBounds(bounds,{top:40,right:40,bottom:40,left:40});return;}
    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
      map.setCenter({lat:Number(d.map_lat),lng:Number(d.map_lng)});
      map.setZoom(Number(d.map_zoom)||15);
      return;
    }
    setDrawMessage('No saved geometry yet. Draw the first road alignment line.','info');
  }

  function openGoogleSettings(){
    const current=window.AMANAH_GOOGLE_MAPS_KEY||'';
    const value=window.prompt('Enter your Google Maps Platform API key. AMANAH stores it only in this browser.',current);
    if(value===null)return;
    const key=String(value).trim();
    if(!key){setDrawMessage('A Google Maps API key is required.','err');return;}
    window.AMANAH_SET_GOOGLE_MAPS_KEY(key);
    location.reload();
  }

  function showKeyRequired(){
    const el=qs('roadMapLeaflet');
    if(!el)return;
    el.innerHTML='<div class="google-map-required"><div class="google-map-icon">GOOGLE</div><h3>Google Maps is ready</h3><p>Enter your Google Maps Platform API key to load the live map.</p><button type="button" class="primary-btn" id="googleMapConfigure">CONFIGURE GOOGLE MAPS</button></div>';
    qs('googleMapConfigure')?.addEventListener('click',openGoogleSettings);
    setDrawMessage('Google Maps API key is required for this page.','info');
  }

  function loadGoogleScript(key){
    return new Promise((resolve,reject)=>{
      if(window.google?.maps){resolve();return;}
      const callback='__AMANAH_GOOGLE_MAPS_READY';
      const timeout=setTimeout(()=>reject(new Error('Google Maps failed to load within 15 seconds. Check your API key, billing, API restrictions, and network.')),15000);
      window[callback]=()=>{clearTimeout(timeout);resolve();};
      const script=document.createElement('script');
      script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback='+callback+'&v=weekly';
      script.async=true;
      script.defer=true;
      script.onerror=()=>{clearTimeout(timeout);reject(new Error('Google Maps JavaScript API could not be loaded. Check the API key and allowed referrers.'));};
      document.head.appendChild(script);
    });
  }

  async function initGoogleMap(){
    const el=qs('roadMapLeaflet');
    if(!el)return;
    const key=window.AMANAH_GOOGLE_MAPS_KEY||'';
    if(!key){showKeyRequired();return;}

    try{
      await loadGoogleScript(key);
      const {Map}=await google.maps.importLibrary('maps');
      apiReady=true;
      map=new Map(el,{
        center:{lat:7.1907,lng:124.383},
        zoom:13,
        mapTypeId:'roadmap',
        gestureHandling:'greedy',
        streetViewControl:false,
        fullscreenControl:true,
        mapTypeControl:true,
        zoomControl:true,
        clickableIcons:true,
        mapId:'DEMO_MAP_ID'
      });

      google.maps.event.addListener(map,'click',async e=>{
        if(!e.latLng)return;
        if(drawState){
          drawState.points.push({lat:e.latLng.lat(),lng:e.latLng.lng()});
          renderDrawPath();
          return;
        }
        if(pointMode){
          const section=selectedSection();
          if(section){
            const kind=pointMode;
            pointMode=null;
            qs('mapStartPoint').classList.remove('active');
            qs('mapEndPoint').classList.remove('active');
            await saveSectionPoint(section,kind,e.latLng.lat(),e.latLng.lng());
          }
          return;
        }
        if(mapCenterMode){
          mapCenterMode=false;
          const b=qs('mapSetCenter');
          b.textContent='SET MAP CENTER';
          b.classList.remove('active');
          await saveMapCenter(e.latLng.lat(),e.latLng.lng());
        }
      });

      google.maps.event.addListener(map,'dblclick',async e=>{
        if(drawState){
          if(drawState.points.length>=1){
            const last=drawState.points[drawState.points.length-1];
            if(Math.abs(last.lat-e.latLng.lat())<1e-8&&Math.abs(last.lng-e.latLng.lng())<1e-8){
              // avoid duplicate endpoint from the double-click sequence
            }else{
              drawState.points.push({lat:e.latLng.lat(),lng:e.latLng.lng()});
            }
            renderDrawPath();
            await finishDrawing();
          }
        }
      });

      bindButtons();
      await loadData();
      setDrawMessage('Google map ready. Drag, zoom, select a target, then draw the real project geometry.','ok');
    }catch(error){
      console.error('AMANAH Google Maps error:',error);
      const message=String(error?.message||error);
      el.innerHTML='<div class="google-map-required"><div class="google-map-icon">ERROR</div><h3>Google Maps could not start</h3><p>'+esc(message)+'</p><button type="button" class="primary-btn" id="googleMapRetry">MAP SETTINGS</button></div>';
      qs('googleMapRetry')?.addEventListener('click',openGoogleSettings);
      setDrawMessage(message,'err');
    }
  }

  async function loadData(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    if(!projectId){setDrawMessage('Missing project_id.','err');return;}
    setDrawMessage('Loading project map data...','info');
    try{
      const [projectResult,phaseResult]=await Promise.all([
        client.from('projects').select('project_id,project_name,location,project_type,project_details').eq('project_id',projectId).limit(1),
        client.from('project_phases').select('phase_id,project_id,phase_code,phase_name,status,sequence_no').eq('project_id',projectId).order('sequence_no',{ascending:true})
      ]);
      if(projectResult.error)throw projectResult.error;
      if(phaseResult.error)throw phaseResult.error;
      if(!projectResult.data?.length)throw new Error('Road project not found.');
      const phases=phaseResult.data||[];
      const phaseIds=phases.map(p=>p.phase_id);

      let sections=[];
      if(phaseIds.length){
        const result=await client.from('project_sections').select('section_id,phase_id,section_code,section_name,station_start_m,station_end_m,route_length_m,status,start_lat,start_lng,end_lat,end_lng').in('phase_id',phaseIds).order('station_start_m',{ascending:true});
        if(result.error)throw result.error;
        sections=(result.data||[]).map(s=>({...s,geometry:null}));
      }

      const sectionIds=sections.map(s=>s.section_id);
      let components=[];
      if(sectionIds.length){
        const result=await client.from('project_work_components').select('work_component_id,section_id,component_type,component_side,component_name,station_start_m,station_end_m,planned_quantity,quantity_unit,status,is_optional,is_active,sort_order').in('section_id',sectionIds).eq('is_active',true).order('sort_order',{ascending:true});
        if(result.error)throw result.error;
        components=(result.data||[]).map(c=>({...c,geometry:null}));
      }

      projectData={project:projectResult.data[0],phases,sections,components};
      const name=qs('roadMapProjectName'); if(name)name.textContent=projectData.project?.project_name||'ROAD PROJECT MAP';
      populateTargets();
      renderLayers();

      const d=projectData.project?.project_details||{};
      if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
        map.setCenter({lat:Number(d.map_lat),lng:Number(d.map_lng)});
        map.setZoom(Number(d.map_zoom)||15);
      }else{
        map.setCenter({lat:7.1907,lng:124.383});
        map.setZoom(13);
      }

      loadGeometryOverlay(projectId);
      setDrawMessage('Google map ready. Select a road section or work component to map its alignment.','ok');
    }catch(error){
      console.error('AMANAH Road Map load error:',error);
      setDrawMessage(error?.message||'Unable to load road project map data.','err');
      updateMapSummary();
    }
  }

  async function loadGeometryOverlay(projectId){
    try{
      const {data,error}=await client.rpc('get_road_project_map_data',{p_project_id:projectId});
      if(error)throw error;
      if(!data)return;
      const sectionMap=new Map((data.sections||[]).map(s=>[s.section_id,s.geometry]));
      const componentMap=new Map((data.components||[]).map(c=>[c.work_component_id,c.geometry]));
      projectData.sections=projectData.sections.map(s=>({...s,geometry:sectionMap.get(s.section_id)||null}));
      projectData.components=projectData.components.map(c=>({...c,geometry:componentMap.get(c.work_component_id)||null}));
      renderLayers();
      fitProject();
    }catch(error){console.warn('AMANAH geometry overlay load:',error?.message||error);}
  }

  function bindButtons(){
    const q=(id,fn)=>qs(id)?.addEventListener('click',fn);
    q('mapTargetType',populateTargets);
    q('mapDrawLine',()=>{
      if(drawState)finishDrawing();
      else startLineDrawing();
    });
    q('mapClearLine',clearSelectedGeometry);
    q('mapStartPoint',()=>setPointMode('START'));
    q('mapEndPoint',()=>setPointMode('END'));
    q('mapFit',fitProject);
    q('mapSetCenter',setCenterModeToggle);
    q('mapSatellite',toggleSatellite);
    q('mapGoogleSettings',openGoogleSettings);
  }

  async function init(){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',init,{once:true});
      return;
    }
    await initGoogleMap();
  }

  window.AMANAHRoadMap={init,refresh:loadData};
  init();
})();
