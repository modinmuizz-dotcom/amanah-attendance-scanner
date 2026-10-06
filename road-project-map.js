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

  function offsetAlignmentCoordinates(coords,offsetMeters){
    if(!coords||coords.length<2||!Number.isFinite(offsetMeters))return [];
    const refLat=Number(coords[0][1]);
    const refLng=Number(coords[0][0]);
    const mPerDegLat=111320;
    const mPerDegLng=111320*Math.cos(refLat*Math.PI/180);
    const pts=coords.map(c=>({
      x:(Number(c[0])-refLng)*mPerDegLng,
      y:(Number(c[1])-refLat)*mPerDegLat
    }));
    const out=[];
    for(let i=0;i<pts.length;i++){
      const prev=pts[Math.max(0,i-1)];
      const next=pts[Math.min(pts.length-1,i+1)];
      let dx=next.x-prev.x;
      let dy=next.y-prev.y;
      const len=Math.hypot(dx,dy);
      if(len<0.000001){
        out.push(coords[i]);
        continue;
      }
      dx/=len; dy/=len;
      const nx=-dy, ny=dx;
      let scale=offsetMeters;
      if(i>0&&i<pts.length-1){
        const p0=pts[i-1], p1=pts[i], p2=pts[i+1];
        const dx1=p1.x-p0.x,dy1=p1.y-p0.y,l1=Math.hypot(dx1,dy1)||1;
        const dx2=p2.x-p1.x,dy2=p2.y-p1.y,l2=Math.hypot(dx2,dy2)||1;
        const n1x=-dy1/l1,n1y=dx1/l1;
        const n2x=-dy2/l2,n2y=dx2/l2;
        const mx=n1x+n2x,my=n1y+n2y;
        const ml=Math.hypot(mx,my);
        if(ml>0.000001){
          const dot=Math.max(-1,Math.min(1,nx*(mx/ml)+ny*(my/ml)));
          if(Math.abs(dot)>0.25) scale=offsetMeters/dot;
          const maxM=Math.max(50,Math.abs(offsetMeters)*4);
          scale=Math.max(-maxM,Math.min(maxM,scale));
        }
      }
      out.push([
        refLng+(pts[i].x+nx*scale)/mPerDegLng,
        refLat+(pts[i].y+ny*scale)/mPerDegLat
      ]);
    }
    return out;
  }

  function renderRoadCorridorReferences(){
    const coords=projectData.alignment?.geometry?.coordinates;
    if(!coords||coords.length<2)return;
    const d=projectData.project?.project_details||{};
    const roadWidth=Number(d.road_width);
    if(!Number.isFinite(roadWidth)||roadWidth<=0)return;

    const laneOffset=roadWidth/4;
    const laneLeft=offsetAlignmentCoordinates(coords,laneOffset);
    const laneRight=offsetAlignmentCoordinates(coords,-laneOffset);

    const laneProps={
      title:'LANE REFERENCE',
      subtitle:'Derived from PRIMARY ROAD ALIGNMENT • road width '+roadWidth.toFixed(2)+' m'
    };

    const left=L.polyline(laneLeft.map(c=>[c[1],c[0]]),{
      color:'#2563eb',weight:3,opacity:.9,dashArray:'9 6'
    }).bindPopup('<strong>LEFT LANE</strong><br>'+esc(laneProps.subtitle));
    const right=L.polyline(laneRight.map(c=>[c[1],c[0]]),{
      color:'#2563eb',weight:3,opacity:.9,dashArray:'9 6'
    }).bindPopup('<strong>RIGHT LANE</strong><br>'+esc(laneProps.subtitle));
    left.addTo(statusLayer);
    right.addTo(statusLayer);

    const shouldering=String(d.road_shouldering||'').toUpperCase()==='YES';
    const shoulderWidth=Number(d.road_shouldering_width);
    if(shouldering&&Number.isFinite(shoulderWidth)&&shoulderWidth>0){
      const shoulderOffset=roadWidth/2+shoulderWidth/2;
      const shoulderLeft=offsetAlignmentCoordinates(coords,shoulderOffset);
      const shoulderRight=offsetAlignmentCoordinates(coords,-shoulderOffset);
      const sub='Derived from alignment • shoulder width '+shoulderWidth.toFixed(2)+' m';
      L.polyline(shoulderLeft.map(c=>[c[1],c[0]]),{
        color:'#16a34a',weight:2.5,opacity:.85,dashArray:'5 7'
      }).bindPopup('<strong>LEFT SHOULDER</strong><br>'+esc(sub)).addTo(statusLayer);
      L.polyline(shoulderRight.map(c=>[c[1],c[0]]),{
        color:'#16a34a',weight:2.5,opacity:.85,dashArray:'5 7'
      }).bindPopup('<strong>RIGHT SHOULDER</strong><br>'+esc(sub)).addTo(statusLayer);
    }
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
      renderRoadCorridorReferences();
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

  function restoreSavedAlignmentInputs(){
    const a=projectData.alignment;
    if(!a)return;

    const setValue=(id,value)=>{
      const el=qs(id);
      if(el&&value!==null&&value!==undefined)el.value=Number(value).toFixed(6);
    };

    setValue('projectStartLat',a.start_lat);
    setValue('projectStartLng',a.start_lng);
    setValue('projectEndLat',a.end_lat);
    setValue('projectEndLng',a.end_lng);

    const hasCurves=(a.elements||[]).some(e=>String(e.element_type||'').toUpperCase()==='CIRCULAR_CURVE');
    const mode=hasCurves?'CUSTOM_CURVE':'STRAIGHT';
    const select=qs('projectAlignmentMode');
    if(select)select.value=mode;

    if(mode==='CUSTOM_CURVE'){
      qs('projectCurveRows').innerHTML='';
      showCurveEditor(true);
      renderSavedCurveRows();
      if(!getCurveRows().length)addCurveRow();
    }else{
      showCurveEditor(false);
      qs('projectCurveRows').innerHTML='';
    }

    updateProjectAlignmentControls();
    updateProjectDistanceSummary();

    const help=qs('projectAlignmentHelp');
    if(help){
      help.textContent=hasCurves
        ? 'Saved project alignment loaded. Edit the curve elements and click SAVE ALIGNMENT COORDINATES to replace it.'
        : 'Saved project alignment loaded. Edit the coordinates and click SAVE ALIGNMENT COORDINATES to replace it.';
    }
  }

  async function saveCurrentAlignmentCoordinates(){
    try{
      const coords=readProjectCoordinates();
      const mode=qs('projectAlignmentMode')?.value||'STRAIGHT';

      if(mode==='CUSTOM_CURVE'){
        if(!getCurveRows().length)addCurveRow();
        const curves=readCurveElementsFromInputs();
        if(curves.length<1)throw new Error('CUSTOM CURVE requires at least one curve element.');
        projectAlignmentState={
          mode,
          start:coords.start,
          end:coords.end,
          curves:[],
          built:null,
          previewLine:null
        };
      }else{
        projectAlignmentState={
          mode:'STRAIGHT',
          start:coords.start,
          end:coords.end,
          curves:[],
          built:null,
          previewLine:null
        };
      }

      await finishCoordinateAlignmentSave();
    }catch(error){
      setDrawMessage(error.message||'Unable to save alignment coordinates.','err');
    }
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
      updateProjectAlignmentControls();
      updateProjectDistanceSummary();
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
      restoreSavedAlignmentInputs();
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
    projectAlignmentState=null;
    updateCurveElementResults([]);
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
    const start={
      lat:parseCoordinate('projectStartLat','Start latitude',-90,90),
      lng:parseCoordinate('projectStartLng','Start longitude',-180,180)
    };
    const end={
      lat:parseCoordinate('projectEndLat','End latitude',-90,90),
      lng:parseCoordinate('projectEndLng','End longitude',-180,180)
    };
    if(Math.abs(start.lat-end.lat)<0.000000001 && Math.abs(start.lng-end.lng)<0.000000001){
      throw new Error('Start and end coordinates cannot be identical. Enter a different end coordinate.');
    }
    return {start,end};
  }

  function distanceMetersBetween(a,b){
    if(!a||!b||!window.L)return NaN;
    return L.latLng(a.lat,a.lng).distanceTo(L.latLng(b.lat,b.lng));
  }

  function formatDistance(meters){
    if(!Number.isFinite(meters))return '—';
    return meters.toFixed(2)+' m';
  }

  function getCurveRows(){
    return Array.from(document.querySelectorAll('.project-curve-row'));
  }

  function addCurveRow(data={}){
    const rows=qs('projectCurveRows');
    if(!rows)return null;

    const row=document.createElement('div');
    row.className='project-curve-row';
    row.innerHTML=
      '<div class="project-curve-row-head">'+
        '<div><strong class="curve-index">CURVE 1</strong><span>PC → P1 → PT</span></div>'+
        '<button type="button" class="secondary-btn project-remove-curve">REMOVE</button>'+
      '</div>'+
      '<div class="curve-coordinate-grid">'+
        '<div class="curve-point-label">PC — START OF CURVE</div>'+
        '<div class="map-field"><label>PC STATION (m)</label><input autocomplete="off" class="curve-pc-station-input" type="number" min="0" step="0.001" inputmode="decimal" placeholder="e.g. 500"></div>'+
        '<div class="curve-point-label">P1 — POINT ON CURVE</div>'+
        '<div class="map-field"><label>P1 STATION (m)</label><input autocomplete="off" class="curve-p1-station-input" type="number" min="0" step="0.001" inputmode="decimal" placeholder="e.g. 550"></div>'+
        '<div class="curve-point-label">PT — END OF CURVE</div>'+
        '<div class="map-field"><label>PT STATION (m)</label><input autocomplete="off" class="curve-pt-station-input" type="number" min="0" step="0.001" inputmode="decimal" placeholder="e.g. 600"></div>'+
        '<div class="map-field"><label>RADIUS (m)</label><input autocomplete="off" class="curve-radius-input" type="number" min="0.01" step="0.001" inputmode="decimal" placeholder="e.g. 150"></div>'+
        '<div class="map-field"><label>DIRECTION</label><select class="curve-direction-input"><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option></select></div>'+
      '</div>'+
      '<div class="curve-calculated-coordinates">'+
        '<span>CALCULATED GEOMETRY</span>'+
        '<small class="curve-calculated-coords">PC — • P1 — • PT —</small>'+
      '</div>'+
      '<div class="curve-result-grid">'+
        '<div><span>DIRECTION</span><strong class="curve-direction">—</strong></div>'+
        '<div><span>RADIUS</span><strong class="curve-radius">—</strong></div>'+
        '<div><span>Δ / DEFLECTION</span><strong class="curve-delta">—</strong></div>'+
        '<div><span>ARC LENGTH</span><strong class="curve-arc-length">—</strong></div>'+
        '<div><span>TANGENT LENGTH</span><strong class="curve-tangent-length">—</strong></div>'+
        '<div><span>PC STATION</span><strong class="curve-pc-station">—</strong></div>'+
        '<div><span>PT STATION</span><strong class="curve-pt-station">—</strong></div>'+
      '</div>';

    const setVal=(cls,v)=>{
      const el=row.querySelector(cls);
      if(el&&v!==undefined&&v!==null)el.value=String(v);
    };
    const meta=data.metadata||{};
    setVal('.curve-pc-station',data.station_start_m??meta.pc_station_m??data.pc_station_m);
    setVal('.curve-p1-station',data.p1_station_m??meta.p1_station_m);
    setVal('.curve-pt-station',data.station_end_m??meta.pt_station_m);
    setVal('.curve-radius-input',data.radius_m);
    const dir=row.querySelector('.curve-direction-input');
    if(dir&&data.direction)dir.value=String(data.direction).toUpperCase()==='RIGHT'?'RIGHT':'LEFT';

    row.querySelector('.project-remove-curve').addEventListener('click',()=>{
      row.remove();
      renumberCurveRows();
      updateProjectDistanceSummary();
      if(projectAlignmentState?.mode==='CUSTOM_CURVE') updateEngineeringPreview(false);
    });
    row.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{
      updateProjectDistanceSummary();
      if(projectAlignmentState?.mode==='CUSTOM_CURVE') updateEngineeringPreview(false);
    }));
    row.querySelectorAll('select').forEach(input=>input.addEventListener('change',()=>{
      updateProjectDistanceSummary();
      if(projectAlignmentState?.mode==='CUSTOM_CURVE') updateEngineeringPreview(false);
    }));

    rows.appendChild(row);
    renumberCurveRows();
    return row;
  }

  function renumberCurveRows(){
    getCurveRows().forEach((row,index)=>{
      const n=row.querySelector('.curve-index');
      if(n)n.textContent='CURVE '+(index+1);
    });
  }

  function readCurveElementsFromInputs(){
    const curves=[];
    for(const row of getCurveRows()){
      const read=(cls,label,min)=>{
        const raw=String(row.querySelector(cls)?.value||'').trim();
        if(raw==='')throw new Error(label+' is required.');
        const v=Number(raw);
        if(!Number.isFinite(v)||v<min)throw new Error(label+' is invalid.');
        return v;
      };
      const pcStation=read('.curve-pc-station-input','PC station',0);
      const p1Station=read('.curve-p1-station-input','P1 station',0);
      const ptStation=read('.curve-pt-station-input','PT station',0);
      const radius=read('.curve-radius-input','Curve radius',0.01);
      const direction=String(row.querySelector('.curve-direction-input')?.value||'LEFT').toUpperCase();
      if(p1Station<=pcStation||ptStation<=p1Station){
        throw new Error('Curve stations must be PC < P1 < PT.');
      }
      const arcLength=ptStation-pcStation;
      const deltaDeg=(arcLength/radius)*RAD_TO_DEG;
      if(deltaDeg>=179.9)throw new Error('Curve deflection is too large. Increase the radius or reduce the PC → PT station range.');
      curves.push({
        pc_station_m:pcStation,
        p1_station_m:p1Station,
        pt_station_m:ptStation,
        radius_m:radius,
        direction:direction==='RIGHT'?'RIGHT':'LEFT'
      });
    }
    return curves;
  }

  function renderSavedCurveRows(){
    const rows=qs('projectCurveRows');
    if(!rows)return;
    rows.innerHTML='';
    const curves=(projectData.alignment?.elements||[])
      .filter(e=>String(e.element_type||'').toUpperCase()==='CIRCULAR_CURVE')
      .sort((a,b)=>Number(a.sequence_no||0)-Number(b.sequence_no||0));
    curves.forEach(e=>addCurveRow({
      station_start_m:e.station_start_m,
      p1_station_m:e.p1_station_m??e.metadata?.p1_station_m,
      station_end_m:e.station_end_m,
      radius_m:e.radius_m,
      direction:e.direction,
      metadata:e.metadata||{}
    }));
    renumberCurveRows();
  }

  function showCurveEditor(show){
    const editor=qs('projectCurveEditor');
    if(editor)editor.style.display=show?'block':'none';
  }

  function updateProjectAlignmentControls(){
    const active=qs('mapTargetType')?.value==='PROJECT';
    const panel=qs('projectAlignmentControls');
    if(panel)panel.style.display=active?'block':'none';

    ['mapStartPoint','mapEndPoint','mapSetCenter'].forEach(id=>{
      const el=qs(id);
      if(el){
        // Section tools stay available outside Project Alignment.
        el.style.display=active?'none':'';
        el.disabled=false;
      }
    });

    const draw=qs('mapDrawLine');
    if(draw){
      draw.style.display=active?'none':'';
      if(!active)draw.textContent='DRAW / REPLACE LINE';
    }

    const fit=qs('mapFit');
    if(fit)fit.textContent='FIT ALIGNMENT';

    const clear=qs('mapClearLine');
    if(clear)clear.textContent=active?'CLEAR ALIGNMENT':'CLEAR LINE';

    const mode=qs('projectAlignmentMode')?.value||'STRAIGHT';
    showCurveEditor(active&&mode==='CUSTOM_CURVE');

    ['projectStartLat','projectStartLng','projectEndLat','projectEndLng'].forEach(id=>{
      const el=qs(id);
      if(el&&!el.dataset.distanceBound){
        el.dataset.distanceBound='1';
        el.addEventListener('input',()=>{
          updateProjectDistanceSummary();
          if(projectAlignmentState?.mode==='CUSTOM_CURVE')updateEngineeringPreview(false);
        });
      }
    });

    if(active&&mode==='CUSTOM_CURVE'&&!getCurveRows().length){
      renderSavedCurveRows();
      if(!getCurveRows().length)addCurveRow();
    }

    updateProjectDistanceSummary();

    // Project Alignment is always centered/fitted from its saved geometry.
    // SET MAP CENTER is intentionally hidden in this mode.
  }

  function readCoordinateInputsSilently(){
    const ids=['projectStartLat','projectStartLng','projectEndLat','projectEndLng'];
    const values=ids.map(id=>Number(qs(id)?.value));
    if(values.some(v=>!Number.isFinite(v)))return null;
    const [startLat,startLng,endLat,endLng]=values;
    if(startLat<-90||startLat>90||endLat<-90||endLat>90||startLng<-180||startLng>180||endLng<-180||endLng>180)return null;
    return {start:{lat:startLat,lng:startLng},end:{lat:endLat,lng:endLng}};
  }

  const EARTH_RADIUS_M=6371008.8;
  const DEG_TO_RAD=Math.PI/180;
  const RAD_TO_DEG=180/Math.PI;

  function toLocalXY(p,origin){
    const lat0=origin.lat*DEG_TO_RAD;
    return {
      x:(p.lng-origin.lng)*DEG_TO_RAD*EARTH_RADIUS_M*Math.cos(lat0),
      y:(p.lat-origin.lat)*DEG_TO_RAD*EARTH_RADIUS_M
    };
  }

  function fromLocalXY(x,y,origin){
    const lat0=origin.lat*DEG_TO_RAD;
    return {
      lat:origin.lat+(y/EARTH_RADIUS_M)*RAD_TO_DEG,
      lng:origin.lng+(x/(EARTH_RADIUS_M*Math.cos(lat0)))*RAD_TO_DEG
    };
  }

  function positiveAngle(rad){
    const two=Math.PI*2;
    return (rad%two+two)%two;
  }

  function fitCircularCurve(pc,p1,pt){
    const origin=pc;
    const a=toLocalXY(pc,origin);
    const b=toLocalXY(p1,origin);
    const c=toLocalXY(pt,origin);
    const denominator=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
    if(Math.abs(denominator)<0.000001)throw new Error('Curve PC, P1 and PT are too close to a straight line to define a circular curve.');

    const a2=a.x*a.x+a.y*a.y;
    const b2=b.x*b.x+b.y*b.y;
    const c2=c.x*c.x+c.y*c.y;
    const ux=((a2*(b.y-c.y))+(b2*(c.y-a.y))+(c2*(a.y-b.y)))/denominator;
    const uy=((a2*(c.x-b.x))+(b2*(a.x-c.x))+(c2*(b.x-a.x)))/denominator;

    const radius=Math.hypot(a.x-ux,a.y-uy);
    if(!Number.isFinite(radius)||radius<0.01||radius>100000000)throw new Error('Calculated curve radius is invalid.');

    const a0=Math.atan2(a.y-uy,a.x-ux);
    const a1=Math.atan2(b.y-uy,b.x-ux);
    const a2ang=Math.atan2(c.y-uy,c.x-ux);

    const ccw01=positiveAngle(a1-a0);
    const ccw12=positiveAngle(a2ang-a1);
    const ccw02=positiveAngle(a2ang-a0);
    const cw01=positiveAngle(a0-a1);
    const cw12=positiveAngle(a1-a2ang);
    const cw02=positiveAngle(a0-a2ang);

    const ccwError=Math.abs((ccw01+ccw12)-ccw02);
    const cwError=Math.abs((cw01+cw12)-cw02);
    const dir=ccwError<=cwError?1:-1;
    const delta=dir===1?ccw02:cw02;
    const firstDelta=dir===1?ccw01:cw01;
    const secondDelta=delta-firstDelta;

    if(delta<0.000001||delta>=Math.PI*2-0.000001)throw new Error('Curve deflection angle is invalid.');
    if(firstDelta<0||secondDelta<0)throw new Error('P1 must lie on the circular arc between PC and PT.');

    const arcLength=radius*delta;
    const chordLength=distanceMetersBetween(pc,pt);
    const tangentLength=Math.abs(delta-Math.PI)<0.000001||delta>Math.PI-0.000001
      ? null
      : radius*Math.tan(delta/2);

    const stepMeters=10;
    const steps1=Math.max(2,Math.min(300,Math.ceil((radius*firstDelta)/stepMeters)));
    const steps2=Math.max(2,Math.min(300,Math.ceil((radius*secondDelta)/stepMeters)));
    const arcPoints=[pc];

    for(let i=1;i<steps1;i++){
      const ang=a0+dir*(firstDelta*i/steps1);
      arcPoints.push(fromLocalXY(ux+radius*Math.cos(ang),uy+radius*Math.sin(ang),origin));
    }
    arcPoints.push(p1);
    for(let i=1;i<steps2;i++){
      const ang=a1+dir*(secondDelta*i/steps2);
      arcPoints.push(fromLocalXY(ux+radius*Math.cos(ang),uy+radius*Math.sin(ang),origin));
    }
    arcPoints.push(pt);

    return {
      direction:dir===1?'LEFT':'RIGHT',
      radius,
      deltaDeg:delta*RAD_TO_DEG,
      arcLength,
      chordLength,
      tangentLength,
      geometry:arcPoints
    };
  }

  function buildEngineeringAlignment(start,end,curves){
    const allPoints=[{lat:start.lat,lng:start.lng}];
    const elements=[];
    let current={lat:start.lat,lng:start.lng};
    let station=0;

    const pushTangent=(from,to)=>{
      const length=distanceMetersBetween(from,to);
      if(length<0.01)return;
      const geometry=[from,to];
      const startStation=station;
      station+=length;
      elements.push({
        element_type:'TANGENT',
        sequence_no:elements.length+1,
        station_start_m:startStation,
        station_end_m:station,
        length_m:length,
        start_lat:from.lat,start_lng:from.lng,
        end_lat:to.lat,end_lng:to.lng,
        geometry:{type:'LineString',coordinates:geometry.map(p=>[p.lng,p.lat])},
        metadata:{}
      });
      allPoints.push(to);
    };

    curves.forEach((curve,index)=>{
      const curveData=fitCircularCurve(curve.pc,curve.p1,curve.pt);
      pushTangent(current,curve.pc);

      const curveStartStation=station;
      station+=curveData.arcLength;
      const curveElement={
        element_type:'CIRCULAR_CURVE',
        sequence_no:elements.length+1,
        station_start_m:curveStartStation,
        station_end_m:station,
        length_m:curveData.arcLength,
        start_lat:curve.pc.lat,start_lng:curve.pc.lng,
        end_lat:curve.pt.lat,end_lng:curve.pt.lng,
        pc_lat:curve.pc.lat,pc_lng:curve.pc.lng,
        p1_lat:curve.p1.lat,p1_lng:curve.p1.lng,
        pt_lat:curve.pt.lat,pt_lng:curve.pt.lng,
        direction:curveData.direction,
        radius_m:curveData.radius,
        delta_deg:curveData.deltaDeg,
        chord_length_m:curveData.chordLength,
        tangent_length_m:curveData.tangentLength,
        geometry:{type:'LineString',coordinates:curveData.geometry.map(p=>[p.lng,p.lat])},
        metadata:{}
      };
      elements.push(curveElement);
      curve.__result={
        direction:curveData.direction,
        radius_m:curveData.radius,
        delta_deg:curveData.deltaDeg,
        arc_length_m:curveData.arcLength,
        tangent_length_m:curveData.tangentLength,
        chord_length_m:curveData.chordLength,
        station_start_m:curveStartStation,
        station_end_m:station
      };
      allPoints.push(...curveData.geometry.slice(1));
      current=curve.pt;
    });

    pushTangent(current,end);

    return {geometry:{type:'LineString',coordinates:allPoints.map(p=>[p.lng,p.lat])},elements,length_m:station};
  }

  function updateCurveElementResults(results=[]){
    getCurveRows().forEach((row,index)=>{
      const r=results[index];
      const set=(cls,value)=>{const el=row.querySelector(cls);if(el)el.textContent=value;};
      if(!r){
        ['.curve-direction','.curve-radius','.curve-delta','.curve-arc-length','.curve-tangent-length','.curve-pc-station','.curve-pt-station']
          .forEach(cls=>set(cls,'—'));
        return;
      }
      set('.curve-direction',r.direction);
      set('.curve-radius',formatDistance(r.radius_m));
      set('.curve-delta',Number(r.delta_deg).toFixed(3)+'°');
      set('.curve-arc-length',formatDistance(r.arc_length_m));
      set('.curve-tangent-length',r.tangent_length_m==null?'—':formatDistance(r.tangent_length_m));
      set('.curve-pc-station',stationLabel(r.station_start_m));
      set('.curve-pt-station',stationLabel(r.station_end_m));
    });
  }

  function updateEngineeringPreview(showMessage=true){
    if(!projectAlignmentState?.start||!projectAlignmentState?.end)return;
    try{
      const curves=readCurveElementsFromInputs();
      const built=buildEngineeringAlignment(projectAlignmentState.start,projectAlignmentState.end,curves);
      projectAlignmentState.curves=curves;
      projectAlignmentState.built=built;
      updateCurveElementResults(curves.map(c=>c.__result));
      if(projectAlignmentState.previewLine)projectAlignmentState.previewLine.remove();
      projectAlignmentState.previewLine=L.polyline(
        built.geometry.coordinates.map(c=>[c[1],c[0]]),
        {color:'#7c3aed',weight:6,opacity:.95,dashArray:showMessage?'10 7':null,interactive:false}
      ).addTo(map);
      if(showMessage){
        focusAlignmentMap(built.geometry.coordinates.map(c=>[c[1],c[0]]));
        setDrawMessage('Engineering alignment preview generated from tangent and circular curve elements.','ok');
      }
      return built;
    }catch(error){
      updateCurveElementResults([]);
      if(showMessage)setDrawMessage(error.message||'Invalid curve element.','err');
      return null;
    }
  }

  function updateProjectDistanceSummary(){
    const straightEl=qs('projectStraightDistance');
    const alignEl=qs('projectAlignmentDistance');
    const mode=qs('projectAlignmentMode')?.value||'STRAIGHT';
    const input=readCoordinateInputsSilently();

    const straight=input?distanceMetersBetween(input.start,input.end):NaN;
    if(straightEl)straightEl.textContent=Number.isFinite(straight)?formatDistance(straight):'—';

    let alignment=straight;
    if(mode==='CUSTOM_CURVE'&&input){
      try{
        const curves=readCurveElementsFromInputs();
        if(curves.length){
          alignment=buildEngineeringAlignment(input.start,input.end,curves).length_m;
        }else{
          alignment=NaN;
        }
      }catch(_){
        alignment=NaN;
      }
    }
    if(alignEl)alignEl.textContent=Number.isFinite(alignment)?formatDistance(alignment):'—';
  }

  function showCurveEditor(show){
    const editor=qs('projectCurveEditor');
    if(editor)editor.style.display=show?'block':'none';
  }

  function finishCoordinateAlignmentSave(){
    const s=projectAlignmentState;
    if(!s)return;
    let built;
    try{
      const curves=s.mode==='CUSTOM_CURVE'?readCurveElementsFromInputs():[];
      built=buildEngineeringAlignment(s.start,s.end,curves);
      if(s.mode==='CUSTOM_CURVE'&&curves.length<1)throw new Error('CUSTOM CURVE requires at least one curve element.');
    }catch(error){
      setDrawMessage(error.message||'Invalid project alignment.','err');
      return;
    }
    s.curves=curves;
    s.built=built;
    updateCurveElementResults(curves.map(c=>c.__result));
    return saveProjectCoordinateAlignment({mode:s.mode,built});
  }

  function focusAlignmentMap(bounds, maxZoom=17){
    const mapEl=qs('roadMap');
    if(mapEl){
      mapEl.scrollIntoView({behavior:'smooth',block:'center'});
    }
    const apply=()=>{
      if(!map||!bounds?.length)return;
      map.invalidateSize({pan:false,animate:false});
      const safeBounds=L.latLngBounds(bounds);
      if(!safeBounds.isValid())return;
      map.fitBounds(safeBounds,{
        padding:[70,70],
        paddingTopLeft:[70,90],
        paddingBottomRight:[70,70],
        maxZoom,
        animate:false
      });
    };
    apply();
    setTimeout(apply,120);
    setTimeout(apply,350);
  }

  async function saveProjectCoordinateAlignment({mode,built}){
    setDrawMessage('Saving project alignment...','info');
    const {data,error}=await client.rpc('save_road_project_alignment',{
      p_project_id:new URLSearchParams(location.search).get('project_id'),
      p_geojson:built.geometry,
      p_source:'SURVEY',
      p_elements:built.elements
    });

    if(error){
      setDrawMessage(error.message||'Unable to save project alignment.','err');
      return;
    }

    projectData.alignment=data||null;

    // The primary alignment is the source of truth. Rebuild all station-based
    // road section and work-component geometries from it immediately.
    const projectId=new URLSearchParams(location.search).get('project_id');
    const {error:stationGeometryError}=await client.rpc('refresh_road_project_station_geometries',{p_project_id:projectId});
    if(stationGeometryError){
      setDrawMessage('Alignment saved, but derived section/component geometry could not be refreshed: '+stationGeometryError.message,'err');
    }

    clearProjectAlignmentState();
    const button=qs('projectGenerateAlignment');
    if(button)button.textContent='GENERATE ALIGNMENT';
    const help=qs('projectAlignmentHelp');
    help.textContent=mode==='CUSTOM_CURVE'
      ? 'Curve elements saved. You can edit the coordinates and generate a new alignment to replace them.'
      : 'Straight alignment saved. Enter new coordinates to replace it.';
    showCurveEditor(false);

    const bounds=allGeometryBounds();
    focusAlignmentMap(bounds);
    setDrawMessage('Project alignment saved with '+built.elements.length+' alignment element(s).','ok');
    updateProjectDistanceSummary();
    await loadData();
  }

  function startLineDrawing(){
    const targetType=qs('mapTargetType').value;
    const targetId=qs('mapTarget').value;

    if(targetType==='PROJECT'){
      setDrawMessage('Project alignment now uses START/END coordinates plus curve elements.','info');
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

  function curvesForMapBounds(){
    const points=[];
    getCurveRows().forEach(row=>{
      [
        ['.curve-pc-lat','.curve-pc-lng'],
        ['.curve-p1-lat','.curve-p1-lng'],
        ['.curve-pt-lat','.curve-pt-lng']
      ].forEach(([la,ln])=>{
        const lat=Number(row.querySelector(la)?.value),lng=Number(row.querySelector(ln)?.value);
        if(Number.isFinite(lat)&&Number.isFinite(lng))points.push([lat,lng]);
      });
    });
    return points;
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
        curves:[],
        built:null,
        previewLine:null
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
        showCurveEditor(true);
        if(!getCurveRows().length){
          renderSavedCurveRows();
          if(!getCurveRows().length)addCurveRow({});
        }

        // Always take the engineer to the entered project coordinates first.
        // The curve preview may be invalid while the PC/P1/PT values are being edited,
        // but the map must still jump to the correct project area.
        focusAlignmentMap([
          [coords.start.lat,coords.start.lng],
          [coords.end.lat,coords.end.lng],
          ...curvesForMapBounds()
        ]);

        const preview=updateEngineeringPreview(true);
        if(preview?.geometry?.coordinates?.length){
          focusAlignmentMap(preview.geometry.coordinates.map(c=>[c[1],c[0]]),17);
        }

        const button=qs('projectGenerateAlignment');
        if(button)button.textContent='SAVE ALIGNMENT';
        setDrawMessage('Define each circular curve with PC, P1 and PT. Add more curve elements as needed, then click SAVE ALIGNMENT.','info');
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
    qs('projectEndLat').value='';
    qs('projectEndLng').value='';
    qs('projectCurveRows').innerHTML='';
    addCurveRow();
    map.setView([lat,lng],Math.max(map.getZoom(),16));
    qs('projectEndLat')?.focus();
    setDrawMessage('Project map center loaded as the START coordinate. Enter the END coordinate next.','info');
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
    qs('projectSaveAlignment')?.addEventListener('click',saveCurrentAlignmentCoordinates);
    qs('projectGenerateAlignment')?.addEventListener('click',async()=>{
      if(projectAlignmentState?.mode==='CUSTOM_CURVE') await finishCoordinateAlignmentSave();
      else await handleProjectGenerateAlignment();
    });
    qs('projectUseMapCenter')?.addEventListener('click',useProjectMapCenter);
    qs('projectAddCurve')?.addEventListener('click',()=>{
      addCurveRow();
      if(qs('projectAlignmentMode').value==='CUSTOM_CURVE'){
        if(projectAlignmentState)updateEngineeringPreview(false);
        updateProjectDistanceSummary();
      }
    });
    qs('projectClearCurves')?.addEventListener('click',()=>{
      qs('projectCurveRows').innerHTML='';
      addCurveRow();
      clearProjectAlignmentState();
      if(qs('projectAlignmentMode').value==='CUSTOM_CURVE')updateProjectAlignmentControls();
      updateProjectDistanceSummary();
    });
    qs('projectAlignmentMode')?.addEventListener('change',()=>{
      clearProjectAlignmentState();
      const b=qs('projectGenerateAlignment');
      if(b)b.textContent='GENERATE ALIGNMENT';
      updateProjectAlignmentControls();
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