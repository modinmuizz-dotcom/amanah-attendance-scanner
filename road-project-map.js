(function(){
  const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  let map=null;
  let drawnItems=null;
  let projectData={project:null,phases:[],sections:[],components:[],alignment:null};
  let drawMode=null;
  let projectAlignmentState=null;
  let mapCenterMode=false;
  let pointMode=null;
  let pointLayer=null;
  let statusLayer=null;
  let basemapLayer=null;

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

    if(projectData.alignment?.geometry?.coordinates){
      const line=featureLine(projectData.alignment.geometry.coordinates,{color:'#7c3aed',weight:6,opacity:.95},{
        title:'PRIMARY ROAD ALIGNMENT',
        subtitle:'PROJECT ALIGNMENT • '+String(projectData.alignment.source||'FREE_DRAW').toUpperCase(),
        station:'PROJECT LENGTH '+Number(projectData.alignment.length_m||0).toFixed(1)+' m'
      });
      if(line)line.addTo(statusLayer);
    }

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
        if(!map.getBounds().isValid()) map.setView([Number(d.map_lat),Number(d.map_lng)],Number(d.map_zoom)||16);
      }
    }
    updateMapSummary();
  }

  function allGeometryBounds(){
    const bounds=[];
    if(projectData.alignment?.geometry?.coordinates){
      projectData.alignment.geometry.coordinates.forEach(c=>bounds.push([c[1],c[0]]));
    }
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
    if(el)el.textContent=(projectData.alignment?'1 project alignment • ':'0 project alignments • ')+nSections+' section alignment'+(nSections===1?'':'s')+' • '+nComponents+' component line'+(nComponents===1?'':'s');
  }

  function populateTargets(){
    const targetType=qs('mapTargetType').value;
    const target=qs('mapTarget');
    const label=qs('mapTargetLabel');
    if(targetType==='PROJECT'){
      if(label)label.textContent='PROJECT ALIGNMENT';
      target.innerHTML='<option value="PROJECT_ALIGNMENT">PRIMARY ROAD ALIGNMENT</option>';
      target.value='PROJECT_ALIGNMENT';
      target.disabled=true;
      if(qs('mapStartPoint'))qs('mapStartPoint').disabled=true;
      if(qs('mapEndPoint'))qs('mapEndPoint').disabled=true;
      if(qs('mapDrawLine'))qs('mapDrawLine').textContent='DRAW PROJECT ALIGNMENT';
      setDrawMessage('Project alignment selected: one click START, double-click END.','info');
      return;
    }
    target.disabled=false;
    if(qs('mapStartPoint'))qs('mapStartPoint').disabled=false;
    if(qs('mapEndPoint'))qs('mapEndPoint').disabled=false;
    if(qs('mapDrawLine'))qs('mapDrawLine').textContent='DRAW / REPLACE LINE';
    if(targetType==='SECTION'){
      if(label)label.textContent='SELECT ROAD SECTION';
      target.innerHTML='<option value="">SELECT ROAD SECTION</option>'+projectData.sections.map(s=>'<option value="'+esc(s.section_id)+'">'+esc(s.section_code+' — '+s.section_name)+' • '+esc(stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m))+'</option>').join('');
      return;
    }
    if(label)label.textContent='SELECT WORK COMPONENT';
    target.innerHTML='<option value="">SELECT WORK COMPONENT</option>'+projectData.components.map(c=>'<option value="'+esc(c.work_component_id)+'">'+esc(c.component_name)+' • '+esc(c.component_side||'NONE')+' • '+esc(stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m))+'</option>').join('');
  }

  function withTimeout(promise,ms,label){
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out after '+ms+' ms.')),ms));
    return Promise.race([promise,timeout]);
  }

  async function loadData(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    if(!projectId) throw new Error('Missing project_id.');

    setDrawMessage('Loading project map data...','info');

    try{
      const [projectResult,phaseResult]=await Promise.all([
        withTimeout(
          client.from('projects')
            .select('project_id,project_name,location,project_type,project_details')
            .eq('project_id',projectId)
            .limit(1),
          4000,'Project'
        ),
        withTimeout(
          client.from('project_phases')
            .select('phase_id,project_id,phase_code,phase_name,status,sequence_no')
            .eq('project_id',projectId)
            .order('sequence_no',{ascending:true}),
          4000,'Phase'
        )
      ]);

      if(projectResult.error) throw projectResult.error;
      if(phaseResult.error) throw phaseResult.error;
      if(!projectResult.data?.length) throw new Error('Road project not found.');

      const phases=phaseResult.data||[];
      const phaseIds=phases.map(p=>p.phase_id);

      let sections=[];
      if(phaseIds.length){
        const result=await withTimeout(
          client.from('project_sections')
            .select('section_id,phase_id,section_code,section_name,station_start_m,station_end_m,route_length_m,status,start_lat,start_lng,end_lat,end_lng')
            .in('phase_id',phaseIds)
            .order('station_start_m',{ascending:true}),
          4000,'Road section'
        );
        if(result.error) throw result.error;
        sections=(result.data||[]).map(s=>({...s,geometry:null}));
      }

      const sectionIds=sections.map(s=>s.section_id);
      let components=[];
      if(sectionIds.length){
        const result=await withTimeout(
          client.from('project_work_components')
            .select('work_component_id,section_id,component_type,component_side,component_name,station_start_m,station_end_m,planned_quantity,quantity_unit,status,is_optional,is_active,sort_order')
            .in('section_id',sectionIds)
            .eq('is_active',true)
            .order('sort_order',{ascending:true}),
          4000,'Work component'
        );
        if(result.error) throw result.error;
        components=(result.data||[]).map(c=>({...c,geometry:null}));
      }

      projectData={
        project:projectResult.data[0],
        phases,
        sections,
        components,
        alignment:null
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

      setDrawMessage('Map ready. Select PROJECT ALIGNMENT to draw the main project road line, or choose a section/component for detailed geometry.','ok');

      // Geometry is optional for initial rendering and loads separately.
      loadGeometryOverlay(projectId);
    }catch(error){
      console.error('AMANAH Road Map load error:',error);
      setDrawMessage(error?.message||'Unable to load project map data.','err');
      updateMapSummary();
    }
  }
  async function loadGeometryOverlay(projectId){
    try{
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('MAP_GEOMETRY_TIMEOUT')),2500));
      const request=client.rpc('get_road_project_map_data',{p_project_id:projectId});
      const {data}=await Promise.race([request,timeout]);
      if(!data)return;
      const sectionMap=new Map((data.sections||[]).map(s=>[s.section_id,s.geometry]));
      const componentMap=new Map((data.components||[]).map(c=>[c.work_component_id,c.geometry]));
      projectData.alignment=data.alignment||null;
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

  function clearProjectAlignmentState(){
    if(projectAlignmentState?.previewLine) projectAlignmentState.previewLine.remove();
    if(projectAlignmentState?.pointMarkers){
      projectAlignmentState.pointMarkers.forEach(m=>m.remove());
    }
    projectAlignmentState=null;
  }

  function parseCoordinate(id,label,min,max){
    const raw=String(qs(id)?.value??'').trim();
    if(raw==='') throw new Error(label+' is required.');
    const value=Number(raw);
    if(!Number.isFinite(value)||value<min||value>max){
      throw new Error(label+' must be between '+min+' and '+max+'.');
    }
    return value;
  }

  function readProjectCoordinates(){
    return {
      start:{
        lat:parseCoordinate('projectStartLat','Start latitude',-90,90),
        lng:parseCoordinate('projectStartLng','Start longitude',-180,180)
      },
      end:{
        lat:parseCoordinate('projectEndLat','End latitude',-90,90),
        lng:parseCoordinate('projectEndLng','End longitude',-180,180)
      }
    };
  }

  function setProjectCoordinateInputs(coords){
    if(!coords)return;
    qs('projectStartLat').value=Number(coords.start.lat).toFixed(6);
    qs('projectStartLng').value=Number(coords.start.lng).toFixed(6);
    qs('projectEndLat').value=Number(coords.end.lat).toFixed(6);
    qs('projectEndLng').value=Number(coords.end.lng).toFixed(6);
  }

  function updateProjectAlignmentControls(){
    const active=qs('mapTargetType')?.value==='PROJECT';
    const panel=qs('projectAlignmentControls');
    if(panel)panel.style.display=active?'block':'none';

    ['mapStartPoint','mapEndPoint'].forEach(id=>{
      const el=qs(id);
      if(el)el.disabled=active;
    });

    const draw=qs('mapDrawLine');
    if(draw){
      draw.textContent=active?'USE COORDINATES':'DRAW / REPLACE LINE';
      draw.style.display=active?'none':'';
    }

    if(active){
      const d=projectData.project?.project_details||{};
      const lat=Number(d.map_lat), lng=Number(d.map_lng);
      if(panel && !qs('projectStartLat').value && Number.isFinite(lat)&&Number.isFinite(lng)){
        qs('projectStartLat').value=lat.toFixed(6);
        qs('projectStartLng').value=lng.toFixed(6);
        qs('projectEndLat').value=lat.toFixed(6);
        qs('projectEndLng').value=lng.toFixed(6);
      }
    }
  }

  function buildProjectPath(start,end,controlPoints=[]){
    return [
      {lat:start.lat,lng:start.lng},
      ...(controlPoints||[]).map(p=>({lat:Number(p.lat),lng:Number(p.lng)})),
      {lat:end.lat,lng:end.lng}
    ];
  }

  function renderProjectPreview(){
    const s=projectAlignmentState;
    if(!s||!map)return;
    if(s.previewLine)s.previewLine.remove();
    s.pointMarkers?.forEach(m=>m.remove());
    const path=buildProjectPath(s.start,s.end,s.controlPoints);
    s.previewLine=L.polyline(path,{
      color:'#7c3aed',
      weight:6,
      opacity:.95,
      dashArray:s.mode==='CUSTOM_CURVE'?'10 7':null,
      interactive:false
    }).addTo(map);
    s.pointMarkers=(s.controlPoints||[]).map((p,i)=>
      L.circleMarker([p.lat,p.lng],{
        radius:5,weight:2,color:'#7c3aed',fillColor:'#fff',fillOpacity:1,interactive:false
      }).addTo(map)
    );
  }

  function finishCoordinateAlignmentSave(){
    const s=projectAlignmentState;
    if(!s)return;
    const coordinates=buildProjectPath(s.start,s.end,s.controlPoints)
      .map(p=>[Number(p.lng),Number(p.lat)]);

    if(coordinates.length<2){
      setDrawMessage('A project alignment needs a start and end coordinate.','err');
      return;
    }

    return saveProjectCoordinateAlignment({
      mode:s.mode,
      coordinates
    });
  }

  async function saveProjectCoordinateAlignment({mode,coordinates}){
    setDrawMessage('Saving project alignment...','info');
    const {data,error}=await client.rpc('save_road_project_alignment',{
      p_project_id:new URLSearchParams(location.search).get('project_id'),
      p_geojson:{type:'LineString',coordinates},
      p_source:'FREE_DRAW'
    });

    if(error){
      setDrawMessage(error.message||'Unable to save project alignment.','err');
      return;
    }

    projectData.alignment=data||null;
    clearProjectAlignmentState();
    const button=qs('projectGenerateAlignment');
    if(button)button.textContent='GENERATE ALIGNMENT';
    const help=qs('projectAlignmentHelp');
    if(help)help.textContent=mode==='CUSTOM_CURVE'
      ? 'Custom curve saved. Enter new coordinates to replace it.'
      : 'Straight alignment saved. Enter new coordinates to replace it.';

    const bounds=allGeometryBounds();
    if(bounds.length)map.fitBounds(L.latLngBounds(bounds),{padding:[35,35],animate:false});
    setDrawMessage('Project alignment saved successfully.','ok');
    await loadData();
  }

  function startLineDrawing(){
    const targetType=qs('mapTargetType').value;
    const targetId=qs('mapTarget').value;

    if(targetType==='PROJECT'){
      setDrawMessage('Project alignment now uses START/END coordinates. Enter the coordinates below.','info');
      qs('projectStartLat')?.focus();
      return;
    }

    if(!targetId){
      setDrawMessage('Select a road section or work component first.','err');
      return;
    }

    if(!window.L?.Draw){
      setDrawMessage('Map drawing tools are not available.','err');
      return;
    }

    drawMode={targetType,targetId};
    const drawer=new L.Draw.Polyline(map,{shapeOptions:{color:'#2563eb',weight:5}});
    drawer.enable();
    setDrawMessage('Click points along the actual project alignment, then double-click to finish the line.','info');
  }

  async function handleProjectGenerateAlignment(){
    try{
      const coords=readProjectCoordinates();
      const mode=qs('projectAlignmentMode').value||'STRAIGHT';

      clearProjectAlignmentState();
      projectAlignmentState={
        mode,
        start:coords.start,
        end:coords.end,
        controlPoints:[],
        previewLine:null,
        pointMarkers:[]
      };

      map.fitBounds(L.latLngBounds([
        [coords.start.lat,coords.start.lng],
        [coords.end.lat,coords.end.lng]
      ]),{padding:[70,70],animate:false});

      if(mode==='STRAIGHT'){
        await finishCoordinateAlignmentSave();
        return;
      }

      if(mode==='CUSTOM_CURVE'){
        renderProjectPreview();
        const button=qs('projectGenerateAlignment');
        if(button)button.textContent='SAVE ALIGNMENT';
        const help=qs('projectAlignmentHelp');
        if(help)help.textContent='CUSTOM CURVE ACTIVE: click the map at each bend/intermediate point. Then click SAVE ALIGNMENT.';
        setDrawMessage('Custom curve active. Click intermediate points along the actual road, then click SAVE ALIGNMENT.','info');
      }
    }catch(error){
      setDrawMessage(error.message||'Enter valid start and end coordinates.','err');
    }
  }

  function useProjectMapCenter(){
    const d=projectData.project?.project_details||{};
    const lat=Number(d.map_lat), lng=Number(d.map_lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){
      setDrawMessage('No project map center has been saved yet.','err');
      return;
    }
    qs('projectStartLat').value=lat.toFixed(6);
    qs('projectStartLng').value=lng.toFixed(6);
    if(!qs('projectEndLat').value)qs('projectEndLat').value=lat.toFixed(6);
    if(!qs('projectEndLng').value)qs('projectEndLng').value=lng.toFixed(6);
    map.setView([lat,lng],Math.max(map.getZoom(),16));
    setDrawMessage('Project map center loaded into the start coordinates. Adjust the end coordinates before generating the alignment.','info');
  }

  async function saveDrawnGeometry(layer){
    if(!drawMode)return;
    const geojson=layer.toGeoJSON().geometry;
    let rpc,args;
    if(drawMode.targetType==='PROJECT'){
      rpc='save_road_project_alignment';
      args={p_project_id:new URLSearchParams(location.search).get('project_id'),p_geojson:geojson,p_source:'FREE_DRAW'};
    }else{
      rpc=drawMode.targetType==='SECTION'?'save_road_section_geometry':'save_road_work_component_geometry';
      args=drawMode.targetType==='SECTION'
        ?{p_section_id:drawMode.targetId,p_geojson:geojson}
        :{p_work_component_id:drawMode.targetId,p_geojson:geojson};
    }
    const {data,error}=await client.rpc(rpc,args);
    if(error){setDrawMessage(error.message||'Unable to save geometry.','err');return;}
    const wasProject=drawMode.targetType==='PROJECT';
    if(wasProject) projectData.alignment=data||null;
    drawMode=null;
    setDrawMessage(wasProject?'Project alignment saved successfully.':'Map line saved successfully.','ok');
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

    if(targetType==='PROJECT' && projectAlignmentState){
      clearProjectAlignmentState();
      const button=qs('projectGenerateAlignment');
      if(button)button.textContent='GENERATE ALIGNMENT';
      setDrawMessage('Project alignment draft cleared. Nothing was changed in Supabase.','info');
      return;
    }

    const target=targetType==='SECTION'
      ? projectData.sections.find(x=>x.section_id===targetId)
      : projectData.components.find(x=>x.work_component_id===targetId);
    const targetLabel=targetType==='PROJECT'
      ? 'PRIMARY ROAD ALIGNMENT'
      : target
      ? (targetType==='SECTION'
        ? (target.section_code+' — '+target.section_name)
        : (target.component_name+' • '+(target.component_side||'NONE')))
      : 'this '+targetType.toLowerCase();
    if(!(await professionalConfirm(targetType,targetLabel)))return;
    if(targetType==='PROJECT'){
      const {error}=await client.rpc('delete_road_project_alignment',{p_project_id:new URLSearchParams(location.search).get('project_id')});
      if(error){setDrawMessage(error.message||'Unable to clear project alignment.','err');return;}
      projectData.alignment=null;
    }else{
      const rpc=targetType==='SECTION'?'save_road_section_geometry':'save_road_work_component_geometry';
      const args=targetType==='SECTION'?{p_section_id:targetId,p_geojson:null}:{p_work_component_id:targetId,p_geojson:null};
      const {error}=await client.rpc(rpc,args);
      if(error){setDrawMessage(error.message||'Unable to clear geometry.','err');return;}
    }
    setDrawMessage(targetType==='PROJECT'?'Project alignment removed successfully.':'Saved map line removed successfully.','ok');
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
    setDrawMessage('Project map center saved.','ok');
  }

  async function init(){
    const mapEl=qs('roadMap');
    const leafletEl=qs('roadMapLeaflet')||mapEl;
    if(!mapEl||!leafletEl)return;

    if(!window.L){
      setDrawMessage('Leaflet failed to load. Refresh the page and try again.','err');
      return;
    }

    // Keep map initialization deliberately close to the official Leaflet
    // pattern: create one map, add one public OSM tile layer, then wire
    // AMANAH features on top. No iframe fallback or map replacement.
    map=L.map(leafletEl,{
      center:[7.1907,124.383],
      zoom:13,
      zoomControl:true,
      attributionControl:true,
      dragging:true,
      scrollWheelZoom:true,
      doubleClickZoom:true,
      touchZoom:true,
      boxZoom:true,
      keyboard:true,
      inertia:true,
      preferCanvas:true,
      fadeAnimation:false,
      zoomAnimation:false,
      markerZoomAnimation:false
    });

    basemapLayer=L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom:19,
        maxNativeZoom:19,
        attribution:'© OpenStreetMap contributors',
        updateWhenIdle:true,
        updateWhenZooming:true,
        keepBuffer:2
      }
    ).addTo(map);

    basemapLayer.on('tileload',()=>setDrawMessage('Map ready. Drag and zoom normally, then select a target to draw project geometry.','ok'));
    basemapLayer.on('tileerror',()=>setDrawMessage('Map tiles could not be loaded. Check your internet connection and refresh the page.','err'));

    drawnItems=new L.FeatureGroup().addTo(map);
    statusLayer=L.layerGroup().addTo(map);

    const refreshMapSize=()=>window.requestAnimationFrame(()=>map&&map.invalidateSize({animate:false}));
    map.whenReady(refreshMapSize);
    window.addEventListener('resize',refreshMapSize,{passive:true});

    qs('mapTargetType')?.addEventListener('change',()=>{
      clearProjectAlignmentState();
      if(drawMode)drawMode=null;
      populateTargets();
      updateProjectAlignmentControls();
    });
    qs('projectGenerateAlignment')?.addEventListener('click',async()=>{
      if(projectAlignmentState?.mode==='CUSTOM_CURVE') await finishCoordinateAlignmentSave();
      else await handleProjectGenerateAlignment();
    });
    qs('projectUseMapCenter')?.addEventListener('click',useProjectMapCenter);
    qs('projectAlignmentMode')?.addEventListener('change',()=>{
      clearProjectAlignmentState();
      const b=qs('projectGenerateAlignment');
      if(b)b.textContent='GENERATE ALIGNMENT';
    });
    qs('mapDrawLine')?.addEventListener('click',startLineDrawing);
    qs('mapClearLine')?.addEventListener('click',clearSelectedGeometry);
    qs('mapStartPoint')?.addEventListener('click',()=>setPointMode('START'));
    qs('mapEndPoint')?.addEventListener('click',()=>setPointMode('END'));
    qs('mapFit')?.addEventListener('click',()=>{
      const bounds=allGeometryBounds();
      if(bounds.length) map.fitBounds(L.latLngBounds(bounds),{padding:[35,35],animate:false});
      else setDrawMessage('No saved geometry yet. Draw the first road alignment line.','info');
    });
    qs('mapSetCenter')?.addEventListener('click',()=>{
      mapCenterMode=!mapCenterMode;
      qs('mapSetCenter').textContent=mapCenterMode?'CLICK MAP TO SAVE CENTER':'SET MAP CENTER';
      qs('mapSetCenter').classList.toggle('active',mapCenterMode);
      setDrawMessage(mapCenterMode?'Click the map at the actual project location.':'Map center mode cancelled.','info');
    });

    map.on('click',async e=>{
      if(projectAlignmentState?.mode==='CUSTOM_CURVE'){
        projectAlignmentState.controlPoints.push({lat:e.latlng.lat,lng:e.latlng.lng});
        renderProjectPreview();
        setDrawMessage('Control point '+projectAlignmentState.controlPoints.length+' added. Continue clicking bends or click SAVE ALIGNMENT.','info');
        return;
      }
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

    refreshMapSize();
    await loadData();
    updateProjectAlignmentControls();
    refreshMapSize();
  }

  window.AMANAHRoadMap={init,refresh:loadData};
})();