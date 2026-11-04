const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const M = require('../project-structure-model.js');
const id = () => crypto.randomUUID();
function completeDraft() {
  const g = M.newGroup('STRUCTURAL WORK', id);
  g.share = 100;
  g.items = [M.newItem('EXCAVATION', id), M.newItem('FOOTING', id)];
  g.items[0].weight = 40;g.items[1].weight = 60;
  return [g];
}
test('each supported type has an independent editable template with unassigned weights', () => {
  for (const type of M.types) {
    const first = M.template(type, id), second = M.template(type, id);
    const total = M.validate(first);
    assert.ok(total.groups >= 2);assert.ok(total.items > 0);assert.equal(total.assigned, 0);
    assert.equal(total.unassigned, total.items);
    assert.notEqual(first[0].id, second[0].id);
    first[0].items[0].name = 'Changed';
    assert.notEqual(second[0].items[0].name, 'Changed');
  }
});
test('building template retains the supplied work and separates combined stages', () => {
  const names = M.template('SCHOOL BUILDING', id).flatMap(g => g.items.map(i => i.name));
  for (const name of ['EXCAVATION','FOOTING','FTB / 1ST LIFT OF COLUMNS','COLUMN 2ND LIFT','ROOF BEAM','SLAB ON FILL — INTERIOR','SLAB ON FILL — EXTERIOR','ROOF TRUSSES / FRAME','ROOFING','CHB PILE','PLASTERING','SKIMCOAT APPLICATION','FINAL PAINT','WINDOW INSTALLATION','CEILING FRAME','ELECTRICAL ROUGH INSTALLATION','CEILING BOARD','FLOOR SMOOTH FINISH','WALL TILING — TOILET AND BATH','PHENOLIC BOARD PARTITION','DOOR INSTALLATION','ELECTRICAL FIXTURES','PLUMBING INSTALLATION','SANITARY FIXTURES','SEPTIC TANK','RAMP RAILING']) assert.ok(names.includes(name), name);
});
test('road projects use the existing workflow', () => assert.throws(() => M.template('CONCRETING OF ROAD', id), /different structure/));
test('a partially weighted draft can be saved but cannot be baselined', () => {
  const groups = completeDraft();groups[0].items[1].weight = 20;
  assert.equal(M.validate(groups).allocated, 6000);
  assert.throws(() => M.validate(groups, true), /exactly 100%/);
});
test('an exact 100% allocation establishes the baseline', () => assert.equal(M.validate(completeDraft(), true).assigned, 10000));
test('decimal allocations use integer basis points without floating-point drift', () => {
  const g = M.newGroup('GROUP', id);g.share=100;g.items = [M.newItem('A', id),M.newItem('B', id),M.newItem('C', id)];
  [33.33,33.33,33.34].forEach((w,i) => g.items[i].weight = w);
  assert.equal(M.validate([g], true).assigned, 10000);
});
test('zero-weight, negative, excessive-precision and oversized allocations are rejected', () => {
  const g = completeDraft();g[0].items[0].weight = 0;g[0].items[1].weight = 100;
  assert.throws(() => M.validate(g, true), /positive weight/);
  for (const weight of [-1,0.123,101,NaN,Infinity]) {g[0].items[0].weight = weight;assert.throws(() => M.validate(g));}
  g[0].items[0].weight = 40;g[0].items[1].weight = 70;assert.throws(() => M.validate(g), /exceed/);
});
test('duplicate group or item IDs cannot be saved', () => {
  const g = completeDraft();g[0].items[1].id = g[0].items[0].id;assert.throws(() => M.validate(g), /unique ID/);
});
test('invalid and reversed dates are rejected', () => {
  const g = completeDraft();g[0].items[0].planned_start = '2026-02-30';assert.throws(() => M.validate(g), /valid planned dates/);
  g[0].items[0].planned_start = '2026-11-10';g[0].items[0].planned_end = '2026-11-01';assert.throws(() => M.validate(g), /before/);
});
test('empty groups cannot establish a baseline and editing does not mutate the saved copy', () => {
  assert.throws(() => M.validate([], true), /at least one/);
  const g = completeDraft();g[0].share=99;g.push(M.newGroup('EMPTY', id));g[1].share=1;assert.throws(() => M.validate(g, true), /contain work items/);
  const original = completeDraft();const cleaned = M.clean(original);cleaned[0].name = 'Other';assert.equal(original[0].name, 'STRUCTURAL WORK');
});
test('group shares are editable independently of their item shares', () => {
  const a=completeDraft()[0], b=completeDraft()[0];a.share=60;b.share=40;
  assert.equal(M.validate([a,b],true).assigned,10000);
  assert.equal(M.groupSummary(a).assigned,10000);
  assert.equal(M.contribution(a,a.items[0]),24);
  a.share=50;
  assert.equal(a.items[0].weight,40);
  assert.equal(M.summary([a,b]).assigned,9000);
  assert.equal(M.contribution(a,a.items[0]),20);
});
test('item allocations have their own 100% total in every group', () => {
  const a=completeDraft()[0],b=completeDraft()[0];a.share=60;b.share=40;
  assert.equal(M.validate([a,b],true).allocated,10000);
  a.items[0].weight=20;a.items[1].weight=30;
  const s=M.validate([a,b]);assert.equal(s.assigned,10000);assert.equal(s.allocated,7000);assert.equal(s.incompleteGroups,1);
  assert.throws(()=>M.validate([a,b],true),/Item shares.*exactly 100%/);
  a.items[0].weight=70;a.items[1].weight=40;
  assert.throws(()=>M.validate([a,b]),/Item shares.*exceed/);
});
test('group shares validate independently and are included in saved payloads', () => {
  const g=completeDraft();g[0].share=0;assert.throws(()=>M.validate(g,true),/positive project share/);
  for(const share of [-1,101,0.123,NaN]){g[0].share=share;assert.throws(()=>M.validate(g),/Group project shares/);}
  g[0].share=60;assert.equal(M.clean(g)[0].share,60);
  assert.throws(()=>M.validate(g,true),/project shares.*exactly 100%/);
});
