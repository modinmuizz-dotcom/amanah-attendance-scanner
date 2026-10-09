/* AMANAH Project Master: optional legacy-safe four-corner site footprint.
   Leaflet / OpenStreetMap; geography is stored in projects.project_details.site_footprint.
   Coordinates are WGS84 latitude/longitude in perimeter order.
*/
(function () {
  'use strict';
  var supported = new Set([
    'MULTI PURPOSE BUILDING','SCHOOL BUILDING','WATER SYSTEM','COVERED COURT'
  ]);
  var editing = null;
  var viewer = null;
  var R = 6371008.8;
  function applies(type) { return supported.has(String(type || '').toUpperCase()); }
  function num(v) {
    if (v === '' || v == null || String(v).trim() === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  function rounded(n, decimals) { return Number(n.toFixed(decimals)); }
  function coord(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = num(p.lat), lng = num(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {lat:lat,lng:lng};
  }
  function pointsFromDetails(details) {
    var fp = details && details.site_footprint;
    var pts = fp && fp.corners;
    return Array.isArray(pts) && pts.length === 4 ? pts.map(coord) : [null,null,null,null];
  }
  function projectXYZ(points) {
    var lat0 = points.reduce(function(s,p){return s+p.lat;},0) / points.length;
    var lon0 = points.reduce(function(s,p){return s+p.lng;},0) / points.length;
    var latScale = Math.PI*R/180, lonScale = latScale*Math.cos(lat0*Math.PI/180);
    return points.map(function(p) {
      return {x:(p.lng-lon0)*lonScale,y:(p.lat-lat0)*latScale};
    });
  }
  function cross(a,b,c) {return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  function intersect(a,b,c,d) {
    return cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0;
  }
  function geometry(points) {
    if (points.length !== 4 || points.some(function(p){return !coord(p);}))
      throw Error('Enter all four valid corner coordinates.');
    var pp = points.map(coord);
    var xy = projectXYZ(pp);
    var sides = xy.map(function(p,i) {
      var q=xy[(i+1)%4]; return Math.hypot(q.x-p.x,q.y-p.y);
    });
    if (sides.some(function(d){return d<0.25;})) throw Error('Corners must be four distinct points.');
    if (intersect(xy[0],xy[1],xy[2],xy[3]) || intersect(xy[1],xy[2],xy[3],xy[0]))
      throw Error('Boundary lines cross. Select corners consecutively around the site, not diagonally.');
    var twiceArea = 0;
    xy.forEach(function(p,i){var q=xy[(i+1)%4];twiceArea+=p.x*q.y-q.x*p.y;});
    var area=Math.abs(twiceArea)/2;
    if (area<0.1) throw Error('Corners are nearly collinear. Check the four points and their order.');
    var perimeter=sides.reduce(function(a,b){return a+b;},0);
    return {area_sqm:rounded(area,2),perimeter_m:rounded(perimeter,2),
      side_lengths_m:sides.map(function(v){return rounded(v,2);}),
      edge_1_3_avg_m:rounded((sides[0]+sides[2])/2,2),
      edge_2_4_avg_m:rounded((sides[1]+sides[3])/2,2)};
  }
  function fm(n) {
    return Number(n).toLocaleString('en-PH',{maximumFractionDigits:2});
  }
  function panel(type,details) {
    if(!applies(type)) return '';
    var pts=pointsFromDetails(details||{});
    var rows=pts.map(function(p,i){
      var idx=i+1;
      return '<div class="site-corner-row" data-corner-row="'+i+'">'+
        '<strong>CORNER '+idx+'</strong>'+
        '<label for="site_lat_'+i+'">Latitude</label>'+
        '<input id="site_lat_'+i+'" type="number" step="any" min="-90" max="90" placeholder="e.g. 7.2101234" value="'+(p?p.lat:'')+'">'+
        '<label for="site_lng_'+i+'">Longitude</label>'+
        '<input id="site_lng_'+i+'" type="number" step="any" min="-180" max="180" placeholder="e.g. 124.2451234" value="'+(p?p.lng:'')+'">'+
        '<button type="button" class="site-corner-select" data-corner-select="'+i+'">SET ON MAP</button>'+
      '</div>';
    }).join('');
    return '<section class="project-site-panel project-detail-section" id="siteFootprintPanel">'+
      '<h3>PROJECT SITE MAP — FOUR CORNERS</h3>'+
      '<p>For '+String(type)+': enter four GPS latitude / longitude pairs, or select each corner on the map in boundary order (clockwise or counterclockwise). Drag markers to fine-tune their locations. The outline represents the site footprint, not the structural floor area.</p>'+
      '<div class="site-map-actions">'+
        '<span id="siteCornerInstruction" class="site-map-instruction">Choose Corner 1, then click its position on the map.</span>'+
        '<button type="button" id="siteFootprintFit">FIT TO CORNERS</button>'+
        '<button type="button" id="siteFootprintClear">CLEAR CORNERS</button>'+
      '</div>'+
      '<div id="projectSiteLeaflet" class="project-site-leaflet" role="application" aria-label="Interactive four corner project site map"></div>'+
      '<div class="site-corners">'+rows+'</div>'+
      '<div id="siteFootprintMetrics" class="site-footprint-metrics">Area and perimeter appear after all four corners have been entered.</div>'+
      '<div id="siteFootprintError" class="site-footprint-error" role="alert" hidden></div>'+
      '<p class="site-survey-notice">Map-based area and dimensions are approximate horizontal measurements from WGS84 coordinates. They are not a licensed boundary survey or a substitute for engineering drawings.</p>'+
    '</section>';
  }
  function readInputs() {
    var pts=[], partial=false,invalid=false;
    for(var i=0;i<4;i++){
      var a=document.getElementById('site_lat_'+i), b=document.getElementById('site_lng_'+i);
      if(!a || !b) return {points:[null,null,null,null],partial:false,invalid:false};
      var lat=num(a.value),lng=num(b.value);
      if(lat===null&&lng===null) pts.push(null);
      else if(lat===null||lng===null) {pts.push(null);partial=true;}
      else if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180){
        pts.push(null);invalid=true;
      } else pts.push({lat:lat,lng:lng});
    }
    return {points:pts,partial:partial,invalid:invalid};
  }
  function setError(message) {
    var el=document.getElementById('siteFootprintError');
    if(el){el.textContent=message||'';el.hidden=!message;}
  }
  function setInstruction(message) {
    var el=document.getElementById('siteCornerInstruction');
    if(el)el.textContent=message;
  }
  function activate(i) {
    if(!editing) return;
    editing.active=i;
    document.querySelectorAll('#siteFootprintPanel [data-corner-row]').forEach(function(el){
      el.classList.toggle('site-corner-active',Number(el.dataset.cornerRow)===i);
    });
    setInstruction(i>=0 ? 'Corner '+(i+1)+' selected. Click its location on the map, or enter coordinates.' :
      'All corners entered. Choose SET ON MAP to reposition, or drag a marker.');
  }
  function fit() {
    if(!editing||!editing.map || typeof L==='undefined')return;
    var pts=readInputs().points.filter(Boolean);
    if(pts.length) editing.map.fitBounds(L.latLngBounds(pts.map(function(p){return [p.lat,p.lng];})).pad(0.24),{maxZoom:19});
    else editing.map.setView([12.8797,121.774],6);
  }
  function update() {
    if(!editing)return;
    var state=readInputs(),pts=state.points,existing=editing.markers;
    existing.forEach(function(marker){if(editing.map)editing.map.removeLayer(marker);});
    editing.markers=[];
    if(editing.polygon && editing.map)editing.map.removeLayer(editing.polygon);
    editing.polygon=null;
    if(editing.map && typeof L!=='undefined'){
      pts.forEach(function(p,i){
        if(!p)return;
        var marker=L.marker([p.lat,p.lng],{draggable:true,title:'Corner '+(i+1)}).addTo(editing.map);
        marker.bindTooltip('C'+(i+1),{permanent:true,direction:'top',offset:[0,-6]});
        marker.on('dragend',function(){
          var ll=marker.getLatLng();
          setPoint(i,{lat:ll.lat,lng:ll.lng},false);
        });
        editing.markers.push(marker);
      });
      if(pts.every(Boolean)){
        editing.polygon=L.polygon(pts.map(function(p){return [p.lat,p.lng];}),
          {color:'#2563eb',weight:3,fillColor:'#60a5fa',fillOpacity:.24}).addTo(editing.map);
      }
    }
    var filled=pts.filter(Boolean).length;
    if(state.invalid) {setError('Latitude must be between -90 and 90; longitude between -180 and 180.');}
    else if(state.partial) {setError('Each corner needs both latitude and longitude.');}
    else if(filled===4){
      try {
        var g=geometry(pts);
        setError('');
        var box=document.getElementById('siteFootprintMetrics');
        if(box)box.innerHTML='<strong>PROJECT FOOTPRINT:</strong> '+fm(g.area_sqm)+' m² ('+fm(g.area_sqm/10000)+' hectares)'+
          ' &nbsp;·&nbsp; <strong>Perimeter:</strong> '+fm(g.perimeter_m)+' m'+
          '<div class="site-side-metrics">Sides: A–B '+fm(g.side_lengths_m[0])+' m; B–C '+fm(g.side_lengths_m[1])+
          ' m; C–D '+fm(g.side_lengths_m[2])+' m; D–A '+fm(g.side_lengths_m[3])+' m.</div>'+
          '<div class="site-side-metrics">Approximate opposite-side averages: '+fm(g.edge_1_3_avg_m)+
          ' m × '+fm(g.edge_2_4_avg_m)+' m.</div>';
      }catch(error){setError(error.message);}
    } else {
      setError('');
      var metrics=document.getElementById('siteFootprintMetrics');
      if(metrics) metrics.textContent=filled? filled+' of 4 corners entered. Complete the boundary to calculate area.' :
        'Area and perimeter appear after all four corners have been entered.';
    }
  }
  function setPoint(i,p,advance) {
    document.getElementById('site_lat_'+i).value=rounded(p.lat,7);
    document.getElementById('site_lng_'+i).value=rounded(p.lng,7);
    if(advance){
      var filled=readInputs().points, next=filled.findIndex(function(x){return !x;});
      activate(next);
    }
    update();
  }
  function destroy(){
    if(editing && editing.map){editing.map.off();editing.map.remove();}
    editing=null;
  }
  function initForm() {
    destroy();
    var element=document.getElementById('projectSiteLeaflet');
    if(!element)return;
    editing={map:null,markers:[],polygon:null,active:0};
    var pts=readInputs().points;
    activate(pts.findIndex(function(p){return !p;}));
    document.getElementById('siteFootprintPanel').addEventListener('input',function(event){
      if(event.target && /^site_(lat|lng)_/.test(event.target.id))update();
    });
    document.getElementById('siteFootprintPanel').addEventListener('click',function(event){
      var button=event.target.closest('[data-corner-select]');
      if(button){activate(Number(button.dataset.cornerSelect));return;}
      if(event.target.closest('#siteFootprintFit'))fit();
      if(event.target.closest('#siteFootprintClear')){
        for(var i=0;i<4;i++){
          document.getElementById('site_lat_'+i).value='';
          document.getElementById('site_lng_'+i).value='';
        }
        activate(0);update();
      }
    });
    if(typeof L==='undefined'){
      element.textContent='Map tiles could not be loaded. Enter all four GPS coordinate pairs above to save the site boundary.';
      update();
      return;
    }
    var map=L.map(element,{scrollWheelZoom:false,zoomControl:true}).setView([12.8797,121.774],6);
    editing.map=map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    map.on('click',function(e){
      if(!editing || editing.map!==map)return;
      if(editing.active<0){setInstruction('Select SET ON MAP for a specific corner to change it.');return;}
      setPoint(editing.active,{lat:e.latlng.lat,lng:e.latlng.lng},true);
    });
    update();
    requestAnimationFrame(function(){
      if(editing && editing.map===map){map.invalidateSize();if(pts.filter(Boolean).length)fit();}
    });
    setTimeout(function(){if(editing&&editing.map===map)map.invalidateSize();},250);
  }
  function collect(mode) {
    var root=document.getElementById('siteFootprintPanel');
    if(!root)return undefined;
    var state=readInputs(),pts=state.points,filled=pts.filter(Boolean).length;
    if(state.invalid||state.partial){
      var msg='Complete valid latitude and longitude values for each selected corner.';
      setError(msg);throw Error(msg);
    }
    if(filled===0){
      if(mode==='add'){
        var msg2='A new project of this type requires four site corners. Use the map or enter the coordinates.';
        setError(msg2);throw Error(msg2);
      }
      return null; // pre-existing unmapped projects remain editable.
    }
    if(filled!==4){var msg3='Enter all 4 site corners before saving.';setError(msg3);throw Error(msg3);}
    try{
      var g=geometry(pts);
      setError('');
      return {coordinate_system:'WGS84',corners:pts.map(function(p){
        return {lat:rounded(p.lat,7),lng:rounded(p.lng,7)};
      }),area_sqm:g.area_sqm,perimeter_m:g.perimeter_m,side_lengths_m:g.side_lengths_m,
        edge_1_3_avg_m:g.edge_1_3_avg_m,edge_2_4_avg_m:g.edge_2_4_avg_m};
    }catch(error){setError(error.message);throw error;}
  }
  function closeViewer(){
    if(!viewer)return;
    if(viewer.map)viewer.map.remove();
    viewer.host.remove();viewer=null;
  }
  function showSaved(project) {
    closeViewer();
    var details=project && project.project_details || {},pts=pointsFromDetails(details);
    var host=document.createElement('div');
    host.className='project-site-viewer-backdrop';
    host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');
    var card=document.createElement('section');
    card.className='project-site-viewer-card';
    var bar=document.createElement('header');
    var heading=document.createElement('div');
    var title=document.createElement('h2');
    title.textContent='PROJECT LOCATION — '+String(project.project_name||'PROJECT');
    var subtitle=document.createElement('p');
    subtitle.textContent=String(project.project_type||'')+' · '+String(project.project_id||'');
    heading.append(title,subtitle);
    var close=document.createElement('button');
    close.className='button secondary';close.textContent='CLOSE';close.type='button';
    close.addEventListener('click',closeViewer);
    bar.append(heading,close);card.append(bar);
    var m=document.createElement('div');m.className='project-site-viewer-map';card.append(m);
    var stats=document.createElement('div');stats.className='project-site-viewer-stats';card.append(stats);
    host.append(card);document.body.append(host);
    host.addEventListener('click',function(e){if(e.target===host)closeViewer();});
    viewer={map:null,host:host};
    if(pts.some(function(p){return !p;})){
      m.textContent='No site boundary saved for this project. Click EDIT to enter four corner coordinates.';
      stats.textContent='Four corners are required to calculate the site area.';
      return;
    }
    try{
      var g=geometry(pts);
      stats.textContent='Site footprint (approx.): '+fm(g.area_sqm)+' m² · Perimeter: '+fm(g.perimeter_m)+
        ' m · Side lengths: '+g.side_lengths_m.map(fm).join(' / ')+' m';
    }catch(error){m.textContent=error.message;return;}
    if(typeof L==='undefined'){
      m.textContent='Map unavailable. Coordinates: '+pts.map(function(p,i){
        return 'Corner '+(i+1)+' '+p.lat+', '+p.lng;
      }).join(' | ');
      return;
    }
    var map=L.map(m,{scrollWheelZoom:false}), polygon=L.polygon(pts.map(function(p){
      return [p.lat,p.lng];
    }),{color:'#2563eb',weight:3,fillOpacity:.25}).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    pts.forEach(function(p,i){
      L.marker([p.lat,p.lng]).addTo(map).bindPopup('Corner '+(i+1)+'<br>Lat: '+p.lat+'<br>Lng: '+p.lng);
    });
    viewer.map=map;
    requestAnimationFrame(function(){
      if(viewer&&viewer.map===map){map.invalidateSize();map.fitBounds(polygon.getBounds().pad(.35),{maxZoom:19});}
    });
  }
  window.AmanahProjectFootprint={
    supports:applies,renderPanel:panel,initForm:initForm,collectForSave:collect,
    destroy:destroy,showSaved:showSaved,geometry:geometry
  };
})();