(function(){
  const SUPABASE_URL='https://bafmycjninxomufhkjvy.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  let map=null, draw=null, projectData={project:null,phases:[],sections:[],components:[],alignment:null};
  let alignmentFeatureId=null, satellite=false, pendingMode=null;

  const qs=id=>document.getElementById(id);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;');

  function notice(text,type='info'){
    const el=qs('roadMapNotice');
    if(!el)return;
    el.textContent=text;
    el.className='road-map-notice '+type;
    el.style.display='block';
  }

  function fmtMeters(m){
    const n=Number(m);
    if(!Number.isFinite(n))return '—';
    return n>=1000 ? (n/1000).toFixed(3)+' km' : n.toFixed(1)+' m';
  }

  function stationLabel(value){
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);
    if(!Number.isFinite(n))return String(value);
    const km=Math.floor(Math.abs(n)/1000), rem=Math.abs(n)-km*1000;
    return 'STA '+(n<0?'-':'')+km+'+'+rem.toFixed(3).padStart(7,'0');
  }

  function statusColor(status){
    switch(String(status||'PLANNED').toUpperCase()){
      case 'DONE':return '#16a34a';
      case 'IN PROGRESS':return '#ea580c';
      case 'NOT DONE':
      case 'CANCELLED':return '#dc2626';
      case 'ON HOLD':return '#7c3aed';
      default:return '#2563eb';
    }
  }

  function lineLength(feature){
    try{return Number(window.turf.length(feature,{units:'kilometers'}))*1000;}catch(_){return 0;}
  }

  function sampleCoordinates(coords,max=100){
    if(coords.length<=max)return coords;
    const out=[];
    for(let i=0;i<max;i++){
      const idx=Math.round(i*(coords.length-1)/(max-1));
      out.push(coords[idx]);
    }
    return out;
  }

  function currentAlignment(){
    if(!draw)return null;
    const fc=draw.getAll();
    const line=fc.features.find(f=>f.geometry?.type==='LineString');
    return line||null;
  }

  function updateAlignmentStats(feature){
    const el=qs('roadAlignmentSummary');
    if(!el)return;
    if(!feature){
      el.innerHTML='<strong>ALIGNMENT</strong><span>No project alignment drawn.</span>';
      return;
    }
    const meters=lineLength(feature);
    const coords=feature.geometry.coordinates;
    el.innerHTML='<strong>ALIGNMENT</strong><span>'+fmtMeters(meters)+' • '+coords.length+' vertices • '+(feature.properties?.source||'FREE DRAW')+'</span>';
  }

  function updateMapSummary(){
    const a=projectData.alignment;
    const sectionCount=projectData.sections.filter(s=>s.geometry).length;
    const componentCount=projectData.components.filter(c=>c.geometry).length;
    const el=qs('roadMapSummary');
    if(!el)return;
    el.textContent=(a?fmtMeters(a.length_m)+' primary alignment • ':'No primary alignment • ')+sectionCount+' mapped section'+(sectionCount===1?'':'s')+' • '+componentCount+' component line'+(componentCount===1?'':'s');
    updateAlignmentStats(currentAlignment());
  }

  function boundsForGeometry(geometry){
    const coords=geometry?.coordinates||[];
    if(!coords.length)return null;
    const b=new mapboxgl.LngLatBounds(coords[0],coords[0]);
    coords.forEach(c=>b.extend(c));
    return b;
  }

  function allBounds(){
    let b=null;
    const extend=coords=>{
      if(!coords?.length)return;
      if(!b)b=new mapboxgl.LngLatBounds(coords[0],coords[0]);
      coords.forEach(c=>b.extend(c));
    };
    if(projectData.alignment?.geometry?.coordinates)extend(projectData.alignment.geometry.coordinates);
    projectData.sections.forEach(s=>extend(s.geometry?.coordinates));
    projectData.components.forEach(c=>extend(c.geometry?.coordinates));
    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lng))&&Number.isFinite(Number(d.map_lat))){
      const p=[Number(d.map_lng),Number(d.map_lat)];
      if(!b)b=new mapboxgl.LngLatBounds(p,p); else b.extend(p);
    }
    return b;
  }

  function addStaticLayers(){
    if(!map.loaded())return;
    ['amanah-sections','amanah-components','amanah-project-location'].forEach(id=>{
      if(map.getLayer(id))map.removeLayer(id);
    });
    ['amanah-sections','amanah-components','amanah-project-location'].forEach(id=>{
      if(map.getSource(id))map.removeSource(id);
    });

    const sectionFeatures=projectData.sections.filter(s=>s.geometry).map(s=>({
      type:'Feature',properties:{
        title:(s.section_code||'SECTION')+' — '+(s.section_name||''),
        status:String(s.status||'PLANNED').toUpperCase(),
        station:stationLabel(s.station_start_m)+' → '+stationLabel(s.station_end_m)
      },geometry:s.geometry
    }));

    const componentFeatures=projectData.components.filter(c=>c.geometry).map(c=>({
      type:'Feature',properties:{
        title:c.component_name||'WORK COMPONENT',
        status:String(c.status||'PLANNED').toUpperCase(),
        side:c.component_side||'NONE',
        type:c.component_type||'WORK COMPONENT',
        station:stationLabel(c.station_start_m)+' → '+stationLabel(c.station_end_m)
      },geometry:c.geometry
    }));

    map.addSource('amanah-sections',{type:'geojson',data:{type:'FeatureCollection',features:sectionFeatures}});
    map.addLayer({
      id:'amanah-sections',type:'line',source:'amanah-sections',
      paint:{'line-color':'#0f172a','line-width':5,'line-opacity':.45}
    });

    map.addSource('amanah-components',{type:'geojson',data:{type:'FeatureCollection',features:componentFeatures}});
    map.addLayer({
      id:'amanah-components',type:'line',source:'amanah-components',
      paint:{
        'line-color':['match',['get','status'],
          'DONE','#16a34a','IN PROGRESS','#ea580c','NOT DONE','#dc2626',
          'CANCELLED','#dc2626','ON HOLD','#7c3aed','#2563eb'
        ],
        'line-width':7,'line-opacity':.85
      }
    });

    const d=projectData.project?.project_details||{};
    if(Number.isFinite(Number(d.map_lng))&&Number.isFinite(Number(d.map_lat))){
      map.addSource('amanah-project-location',{type:'geojson',data:{
        type:'Feature',properties:{title:'PROJECT LOCATION'},
        geometry:{type:'Point',coordinates:[Number(d.map_lng),Number(d.map_lat)]}
      }});
      map.addLayer({
        id:'amanah-project-location',type:'circle',source:'amanah-project-location',
        paint:{'circle-radius':8,'circle-color':'#2563eb','circle-stroke-color':'#fff','circle-stroke-width':3}
      });
    }
  }

  function loadAlignmentIntoDraw(){
    if(!draw)return;
    draw.deleteAll();
    alignmentFeatureId=null;
    const g=projectData.alignment?.geometry;
    if(g?.type==='LineString'&&g.coordinates?.length>=2){
      const ids=draw.add({type:'Feature',properties:{source:projectData.alignment.source||'FREE_DRAW'},geometry:g});
      alignmentFeatureId=ids[0];
      updateAlignmentStats(currentAlignment());
    }else{
      updateAlignmentStats(null);
    }
  }

  async function loadData(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    if(!projectId){notice('Missing project_id.','err');return;}
    notice('Loading road project data...','info');
    try{
      const {data,error}=await client.rpc('get_road_project_map_data',{p_project_id:projectId});
      if(error)throw error;
      projectData={
        project:data?.project||null,
        alignment:data?.alignment||null,
        phases:data?.phases||[],
        sections:data?.sections||[],
        components:data?.components||[]
      };

      qs('roadMapProjectName').textContent=projectData.project?.project_name||'ROAD PROJECT MAP';
      if(projectData.project?.project_details){
        const d=projectData.project.project_details;
        if(Number.isFinite(Number(d.map_lng))&&Number.isFinite(Number(d.map_lat))){
          map.jumpTo({center:[Number(d.map_lng),Number(d.map_lat)],zoom:Number(d.map_zoom)||15});
        }
      }

      addStaticLayers();
      loadAlignmentIntoDraw();
      updateMapSummary();

      const b=allBounds();
      if(b&&!projectData.project?.project_details?.map_lng)map.fitBounds(b,{padding:60,maxZoom:16});
      notice(projectData.alignment?'Road alignment loaded. You can edit it, snap it to the road network, or redraw it.':'Map ready. Draw the primary road alignment first.','ok');
    }catch(error){
      console.error('AMANAH Road Map load error:',error);
      notice(error?.message||'Unable to load road project map data.','err');
    }
  }

  async function saveAlignment(source){
    const feature=currentAlignment();
    if(!feature){
      notice('Draw a road alignment first.','err');
      return;
    }
    if(feature.geometry.coordinates.length<2){
      notice('Alignment needs at least two points.','err');
      return;
    }
    const projectId=new URLSearchParams(location.search).get('project_id');
    notice('Saving project alignment...','info');
    const {data,error}=await client.rpc('save_road_project_alignment',{
      p_project_id:projectId,
      p_geojson:feature.geometry,
      p_source:source||feature.properties?.source||'FREE_DRAW'
    });
    if(error){
      notice(error.message||'Unable to save project alignment.','err');
      return;
    }
    projectData.alignment={
      ...(projectData.alignment||{}),
      alignment_id:data.alignment_id,
      length_m:Number(data.length_m),
      source:data.source,
      geometry:data.geometry
    };
    feature.properties={...(feature.properties||{}),source:data.source};
    updateAlignmentStats(feature);
    updateMapSummary();
    notice('Project alignment saved • '+fmtMeters(data.length_m)+'.','ok');
  }

  async function snapToRoad(){
    const feature=currentAlignment();
    const token=window.AMANAH_MAPBOX_TOKEN||'';
    if(!feature){notice('Draw the road alignment first.','err');return;}
    if(!token){openTokenDialog();return;}

    const coords=sampleCoordinates(feature.geometry.coordinates,100);
    if(coords.length<2){notice('At least two alignment points are required.','err');return;}

    notice('Snapping alignment to the road network...','info');
    try{
      const coordinates=coords.map(c=>c[0]+','+c[1]).join(';');
      const url='https://api.mapbox.com/matching/v5/mapbox/driving/'+coordinates+'.json?access_token='+encodeURIComponent(token)+'&geometries=geojson&overview=full&tidy=true&steps=false';
      const response=await fetch(url);
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||'Map Matching request failed.');
      const matched=json.matchings?.[0]?.geometry;
      if(!matched?.coordinates?.length)throw new Error('No road match was found for this alignment.');
      draw.deleteAll();
      const ids=draw.add({type:'Feature',properties:{source:'ROAD_MATCHED'},geometry:matched});
      alignmentFeatureId=ids[0];
      updateAlignmentStats(currentAlignment());
      map.fitBounds(boundsForGeometry(matched),{padding:60});
      notice('Road match complete. Review the line, then click SAVE ALIGNMENT.','ok');
    }catch(error){
      console.error('AMANAH road matching error:',error);
      notice(error?.message||'Unable to snap the alignment to the road network.','err');
    }
  }

  async function deleteAlignment(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    if(!projectData.alignment&&!currentAlignment()){
      notice('There is no saved alignment to delete.','info');return;
    }
    if(!confirm('Delete the primary road alignment? This removes the project-level alignment only; phases, sections and work components remain.'))return;
    const {error}=await client.rpc('delete_road_project_alignment',{p_project_id:projectId});
    if(error){notice(error.message||'Unable to delete alignment.','err');return;}
    draw.deleteAll();
    alignmentFeatureId=null;
    projectData.alignment=null;
    updateAlignmentStats(null);
    updateMapSummary();
    notice('Primary road alignment deleted.','ok');
  }

  function openTokenDialog(){
    const current=window.AMANAH_MAPBOX_TOKEN||'';
    const value=prompt('Enter your Mapbox PUBLIC access token. It will be stored only in this browser for AMANAH.',current);
    if(value===null)return;
    if(!/^pk\./.test(value.trim())){
      notice('That does not look like a Mapbox public token. Public tokens normally start with pk.','err');
      return;
    }
    window.AMANAH_SET_MAPBOX_TOKEN(value.trim());
    location.reload();
  }

  function setMode(mode){
    if(!draw)return;
    pendingMode=mode;
    if(mode==='draw_line_string'){
      draw.changeMode('draw_line_string');
      notice('DRAW ALIGNMENT: click along the road to add points. Double-click the last point to finish.','info');
    }else{
      draw.changeMode('simple_select');
      notice('EDIT ALIGNMENT: click the line, then drag its vertices to refine the alignment.','info');
    }
  }

  function toggleStyle(){
    satellite=!satellite;
    map.setStyle(satellite?'mapbox://styles/mapbox/standard-satellite':'mapbox://styles/mapbox/standard');
    map.once('style.load',()=>{
      addStaticLayers();
      loadAlignmentIntoDraw();
      notice(satellite?'Satellite imagery enabled.':'Standard road map enabled.','ok');
    });
  }

  function fitAlignment(){
    const feature=currentAlignment();
    const b=feature?boundsForGeometry(feature.geometry):allBounds();
    if(!b){notice('No saved project geometry is available to fit.','info');return;}
    map.fitBounds(b,{padding:60,maxZoom:17});
  }

  function saveCenterFromMap(){
    const projectId=new URLSearchParams(location.search).get('project_id');
    const c=map.getCenter(), z=Math.round(map.getZoom()*10)/10;
    const d=projectData.project?.project_details||{};
    client.rpc('save_road_project_map_center',{
      p_project_id:projectId,p_map_lat:c.lat,p_map_lng:c.lng,p_map_zoom:z,
      p_project_details:{...d,map_lat:c.lat,map_lng:c.lng,map_zoom:z}
    }).then(({error})=>{
      if(error)notice(error.message||'Unable to save map center.','err');
      else notice('Project map center saved.','ok');
    });
  }

  function bindButtons(){
    qs('mapDrawAlignment')?.addEventListener('click',()=>setMode('draw_line_string'));
    qs('mapEditAlignment')?.addEventListener('click',()=>setMode('simple_select'));
    qs('mapSnapRoad')?.addEventListener('click',snapToRoad);
    qs('mapSaveAlignment')?.addEventListener('click',()=>saveAlignment(currentAlignment()?.properties?.source||'FREE_DRAW'));
    qs('mapDeleteAlignment')?.addEventListener('click',deleteAlignment);
    qs('mapFit')?.addEventListener('click',fitAlignment);
    qs('mapStyleToggle')?.addEventListener('click',toggleStyle);
    qs('mapSetCenter')?.addEventListener('click',saveCenterFromMap);
    qs('mapToken')?.addEventListener('click',openTokenDialog);
  }

  function initMap(){
    const token=window.AMANAH_MAPBOX_TOKEN||'';
    const mapEl=qs('roadMapLeaflet');
    if(!mapEl)return;
    if(!token){
      mapEl.innerHTML='<div class="map-token-required"><div class="map-token-icon">MAP</div><h3>Mapbox is ready — public token required</h3><p>Click <strong>MAP SETTINGS</strong> to enter your Mapbox public access token. AMANAH stores it only in this browser.</p><button type="button" class="primary-btn" id="mapTokenInline">CONFIGURE MAPBOX</button></div>';
      qs('mapTokenInline')?.addEventListener('click',openTokenDialog);
      bindButtons();
      notice('Mapbox token is not configured yet.','info');
      return;
    }

    if(!window.mapboxgl||!window.MapboxDraw||!window.turf){
      notice('Map libraries failed to load. Refresh the page and try again.','err');
      return;
    }

    mapboxgl.accessToken=token;
    map=new mapboxgl.Map({
      container:mapEl,
      style:'mapbox://styles/mapbox/standard',
      center:[124.383,7.1907],
      zoom:13,
      attributionControl:true,
      projection:'mercator'
    });

    map.addControl(new mapboxgl.NavigationControl({visualizePitch:false}),'top-right');
    map.addControl(new mapboxgl.ScaleControl({maxWidth:160,unit:'metric'}),'bottom-left');

    draw=new MapboxDraw({
      displayControlsDefault:false,
      controls:{line_string:true,trash:true},
      defaultMode:'simple_select',
      styles:[
        {id:'gl-draw-line',type:'line',filter:['all',['==','$type','LineString'],['!=','mode','static']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2563eb','line-width':5,'line-opacity':.95}},
        {id:'gl-draw-line-static',type:'line',filter:['all',['==','$type','LineString'],['==','mode','static']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2563eb','line-width':5,'line-opacity':.95}}
      ]
    });
    map.addControl(draw,'top-left');

    // Bind the AMANAH toolbar immediately. Do not wait for Mapbox's
    // style/load event; otherwise a slow or blocked Mapbox load would
    // leave DRAW / MAP SETTINGS / FIT etc. unclickable.
    bindButtons();

    map.on('load',async()=>{
      await loadData();
    });

    map.on('draw.create',e=>{
      alignmentFeatureId=e.features?.[0]?.id||null;
      const f=currentAlignment();
      if(f)f.properties={...(f.properties||{}),source:'FREE_DRAW'};
      updateAlignmentStats(f);
      notice('Alignment drawn. You can EDIT, SNAP TO ROAD, then SAVE ALIGNMENT.','ok');
    });
    map.on('draw.update',e=>{
      const f=currentAlignment();
      updateAlignmentStats(f);
      notice('Alignment edited. Click SAVE ALIGNMENT to store the new geometry.','info');
    });
    map.on('draw.delete',()=>{
      alignmentFeatureId=null;
      updateAlignmentStats(null);
      notice('Unsaved alignment removed from the map.','info');
    });

    map.on('error',e=>{
      if(e?.error?.status===401||String(e?.error?.message||'').toLowerCase().includes('token')){
        notice('Mapbox rejected the public token. Open MAP SETTINGS and enter a valid token.','err');
      }
    });
  }

  function init(){
    const ready=()=>initMap();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});
    else ready();
  }

  window.AMANAHRoadMap={init,refresh:loadData,saveAlignment,snapToRoad};
  init();
})();