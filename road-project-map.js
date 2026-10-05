(function(){
  const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  let map=null;
  let projectData={project:null,phases:[],sections:[],components:[]};
  let statusLayer=null;
  let basemapLayer=null;
  let centerMarker=null;
  let setCenterMode=false;

  const qs=id=>document.getElementById(id);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;');

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

  function setDrawMessage(text,type='info'){
    const el=qs('roadMapNotice');
    if(!el)return;
    el.textContent=text;
    el.className='road-map-notice '+type;
    el.style.display='block';
  }

  function featureLine(coords,style,props){
    if(!coords||coords.length<2)return null;
    const line=L.polyline(coords.map(c=>[c[1],c[0]]),style);
    line.bindPopup('<strong>'+esc(props.title)+'</strong><br>'+esc(props.subtitle||'')+(props.station?'<br>'+esc(props.station):''));
    return line;
  }

  function renderLayers(){
    if(!map)return;
    if(statusLayer)statusLayer.clearLayers();
    else statusLayer=L.layerGroup().addTo(map);

    projectData.sections.forEach(s=>{
      if(s.geometry?.coordinates){
        const line=featureLine(s.geometry.coordinates,{color:'#0f172a',weight:6,opacity:.45},{
          title:(s.section_code||'SECTION')+' — '+(s.section_name||''),
          subtitle:'ROAD SECTION • '+String(s.status||'PLANNED').toUpperCase(),
          station:stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m)
        });
        if(line)line.addTo(statusLayer);
      }
    });

    projectData.components.forEach(c=>{
      if(c.geometry?.coordinates){
        const line=featureLine(c.geometry.coordinates,{color:statusColor(c.status),weight:7,opacity:.85},{
          title:c.component_name||'WORK COMPONENT',
          subtitle:(c.component_type||'WORK COMPONENT')+' • '+(c.component_side||'NONE')+' • '+(c.status||'PLANNED'),
          station:stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m)
        });
        if(line)line.addTo(statusLayer);
      }
    });

    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
      centerMarker=L.marker([Number(d.map_lat),Number(d.map_lng)])
        .addTo(statusLayer)
        .bindPopup('<strong>PROJECT LOCATION</strong><br>'+esc(projectData.project?.project_name||''));
    }

    updateMapSummary();
  }

  function allGeometryBounds(){
    const bounds=[];
    projectData.sections.forEach(s=>{
      s.geometry?.coordinates?.forEach(c=>bounds.push([c[1],c[0]]));
    });
    projectData.components.forEach(c=>{
      c.geometry?.coordinates?.forEach(p=>bounds.push([p[1],p[0]]));
    });
    return bounds;
  }

  function updateMapSummary(){
    const nSections=projectData.sections.filter(s=>s.geometry).length;
    const nComponents=projectData.components.filter(c=>c.geometry).length;
    const el=qs('roadMapSummary');
    if(el)el.textContent=nSections+' section alignment'+(nSections===1?'':'s')+' • '+nComponents+' component line'+(nComponents===1?'':'s');
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

      projectData={project:projectResult.data[0],phases,sections,components};

      const projectNameEl=qs('roadMapProjectName');
      if(projectNameEl)projectNameEl.textContent=projectData.project?.project_name||'ROAD PROJECT MAP';

      renderLayers();

      const d=projectData.project?.project_details||{};
      if(Number.isFinite(Number(d.map_lat))&&Number.isFinite(Number(d.map_lng))){
        map.setView([Number(d.map_lat),Number(d.map_lng)],Number(d.map_zoom)||15);
      }else{
        map.setView([7.1907,124.383],13);
      }

      setDrawMessage('Map ready. Drag and zoom normally. Use SET PROJECT LOCATION to place the marker.','ok');
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
      projectData.sections=projectData.sections.map(s=>({...s,geometry:sectionMap.get(s.section_id)||null}));
      projectData.components=projectData.components.map(c=>({...c,geometry:componentMap.get(c.work_component_id)||null}));
      renderLayers();
    }catch(_error){}
  }

  async function saveMapCenter(lat,lng){
    const projectId=new URLSearchParams(location.search).get('project_id');
    const zoom=map.getZoom();
    const d=projectData.project?.project_details||{};
    const merged={...d,map_lat:lat,map_lng:lng,map_zoom:zoom};
    const {error}=await client.rpc('save_road_project_map_center',{
      p_project_id:projectId,
      p_map_lat:lat,
      p_map_lng:lng,
      p_map_zoom:zoom,
      p_project_details:merged
    });
    if(error){
      setDrawMessage(error.message||'Unable to save project location.','err');
      return;
    }

    projectData.project.project_details=merged;
    if(centerMarker){
      centerMarker.remove();
      centerMarker=null;
    }
    if(!statusLayer)statusLayer=L.layerGroup().addTo(map);
    centerMarker=L.marker([lat,lng])
      .addTo(statusLayer)
      .bindPopup('<strong>PROJECT LOCATION</strong><br>'+esc(projectData.project.project_name||''))
      .openPopup();

    setDrawMessage('Project location saved.','ok');
  }

  function setCenterModeEnabled(enabled){
    setCenterMode=enabled;
    const button=qs('mapSetCenter');
    if(button){
      button.textContent=enabled?'CLICK MAP TO PLACE LOCATION':'SET PROJECT LOCATION';
      button.classList.toggle('active',enabled);
    }
    setDrawMessage(
      enabled
        ? 'Click once on the map to place the project location. Dragging and zooming remain normal.'
        : 'Project location mode cancelled.',
      'info'
    );
  }

  async function init(){
    const mapEl=qs('roadMap');
    const leafletEl=qs('roadMapLeaflet')||mapEl;
    if(!mapEl||!window.L)return;

    map=L.map(leafletEl,{
      zoomControl:true,
      doubleClickZoom:true,
      dragging:true,
      scrollWheelZoom:true,
      touchZoom:true,
      boxZoom:true,
      keyboard:true
    });

    const basemapProviders=[
      {
        name:'OpenStreetMap',
        url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options:{maxZoom:19,attribution:'© OpenStreetMap contributors'}
      },
      {
        name:'OpenStreetMap DE',
        url:'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
        options:{maxZoom:19,attribution:'© OpenStreetMap contributors'}
      },
      {
        name:'OSM France',
        url:'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
        options:{maxZoom:19,attribution:'© OpenStreetMap contributors'}
      },
      {
        name:'CARTO',
        url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options:{maxZoom:20,subdomains:'abcd',attribution:'© OpenStreetMap contributors © CARTO'}
      }
    ];

    let providerIndex=0;
    let tileErrorCount=0;
    let tileLoaded=false;

    function useBasemap(index){
      providerIndex=index;
      tileErrorCount=0;
      tileLoaded=false;
      const provider=basemapProviders[providerIndex];

      if(basemapLayer){
        map.removeLayer(basemapLayer);
        basemapLayer=null;
      }

      basemapLayer=L.tileLayer(provider.url,provider.options).addTo(map);
      setDrawMessage('Loading '+provider.name+' map tiles...','info');

      basemapLayer.on('tileload',()=>{
        tileLoaded=true;
        setDrawMessage('Map ready. Drag and zoom normally. Use SET PROJECT LOCATION to place the marker.','ok');
      });

      basemapLayer.on('tileerror',()=>{
        tileErrorCount++;
        if(tileErrorCount>=3){
          if(providerIndex<basemapProviders.length-1){
            useBasemap(providerIndex+1);
          }else{
            setDrawMessage('Map tiles could not be loaded. Please check the internet connection and refresh the page.','err');
          }
        }
      });
    }

    useBasemap(0);

    setTimeout(()=>{
      if(!tileLoaded && providerIndex<basemapProviders.length-1){
        useBasemap(providerIndex+1);
      }
    },4500);

    statusLayer=L.layerGroup().addTo(map);
    setTimeout(()=>map.invalidateSize(),150);

    qs('mapSetCenter').addEventListener('click',()=>{
      setCenterModeEnabled(!setCenterMode);
    });

    qs('mapFit').addEventListener('click',()=>{
      const bounds=allGeometryBounds();
      if(bounds.length){
        map.fitBounds(L.latLngBounds(bounds),{padding:[35,35]});
        setDrawMessage('Map fitted to saved project geometry.','ok');
      }else{
        setDrawMessage('No saved road geometry yet. The map will remain at the project location.','info');
      }
    });

    map.on('click',async e=>{
      if(!setCenterMode)return;
      setCenterModeEnabled(false);
      await saveMapCenter(e.latlng.lat,e.latlng.lng);
    });

    await loadData();
  }

  window.AMANAHRoadMap={init,refresh:loadData};
})();