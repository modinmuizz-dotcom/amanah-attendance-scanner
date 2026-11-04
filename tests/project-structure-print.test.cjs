const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../project-structure-model.js');
const P=require('../project-structure-print.js');
const project={project_id:'SCHOOL-01',project_name:'School Building',project_type:'SCHOOL BUILDING',location:'Test site'};
function groups(){
  const a=M.newGroup('STRUCTURAL WORK'),b=M.newGroup('ARCHITECTURAL WORK');a.share=60;b.share=40;
  a.items=[M.newItem('EXCAVATION'),M.newItem('FOOTING')];a.items.forEach(i=>i.weight=50);
  b.items=[M.newItem('CHB PILE')];b.items[0].weight=100;
  a.items[0].location='Block A / Floor 1';a.items[0].planned_start='2026-11-04';a.items[0].planned_end='2026-11-08';
  return[a,b];
}
test('print report contains project metadata, complete scope, groups, item shares, contributions and dates',()=>{
  const html=P.build(project,{status:'BASELINED',baseline_version:3,updated_at:'2026-11-04T06:00:00Z'},groups(),{printedAt:'2026-11-04T06:05:00Z'});
  for(const value of ['AMANAH CONSTRUCTION SERVICES','School Building','SCHOOL-01','SCHOOL BUILDING','Test site','BASELINE V3','Define the complete project scope','2 work groups · 3 work items','STRUCTURAL WORK','ARCHITECTURAL WORK','60.00%','40.00%','50.00%','30.00%','100.00%','Block A / Floor 1','2026-11-04','2026-11-08'])assert.ok(html.includes(value),value);
  assert.doesNotMatch(html,/<input|<button|UNSAVED DRAFT|Scope allocation is incomplete/);
});
test('draft print identifies unsaved and incomplete allocations',()=>{
  const scope=groups();scope[0].items[0].weight=0;
  const html=P.build(project,{status:'DRAFT',baseline_version:1},scope,{dirty:true});
  assert.match(html,/UNSAVED DRAFT/);assert.match(html,/Includes the current on-screen changes/);assert.match(html,/Scope allocation is incomplete/);
  assert.match(html,/70.00%/);assert.match(html,/0.00%/);
});
test('printed names and locations are escaped and retain their full long text',()=>{
  const scope=groups();const name='LONG WORK '.repeat(20);scope[0].items[0].name=name;scope[0].items[0].location='<script>bad()</script>';
  const html=P.build({...project,project_name:'School <One>'},null,scope,{dirty:true});
  assert.ok(html.includes(name));assert.match(html,/School &lt;One&gt;/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('large work groups include every row and repeated table headings',()=>{
  const a=M.newGroup('LARGE GROUP');a.share=100;a.items=Array.from({length:400},(_,i)=>M.newItem('ROW '+i));a.items.forEach(i=>i.weight=.25);
  const html=P.build(project,{status:'BASELINED',baseline_version:1},[a]);
  assert.equal((html.match(/<tr><td>/g)||[]).length,400);assert.match(html,/ROW 399/);assert.match(html,/<thead>/);assert.match(html,/400 work items/);
});
test('empty scope is printable as a clearly incomplete new structure',()=>{
  const html=P.build(project,null,[]);assert.match(html,/NEW STRUCTURE/);assert.match(html,/No work groups defined/);assert.match(html,/Scope allocation is incomplete/);
});
