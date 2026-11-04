/* Scope allocation: each group owns a project share; its items divide that group. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmanahProjectStructure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const types = ['SCHOOL BUILDING', 'MULTI PURPOSE BUILDING', 'COVERED COURT', 'WATER SYSTEM'];
  const building = [
    ['STRUCTURAL WORK', [
      'EXCAVATION', 'FOOTING', 'FTB / 1ST LIFT OF COLUMNS', 'COLUMN 2ND LIFT', 'ROOF BEAM',
      'SLAB ON FILL — INTERIOR', 'SLAB ON FILL — EXTERIOR', 'ROOF TRUSSES / FRAME', 'ROOFING'
    ]],
    ['ARCHITECTURAL WORK', [
      'CHB PILE', 'PLASTERING', 'SKIMCOAT APPLICATION', 'FINAL PAINT', 'WINDOW INSTALLATION',
      'CEILING FRAME', 'ELECTRICAL ROUGH INSTALLATION', 'CEILING BOARD', 'FLOOR SMOOTH FINISH',
      'WALL TILING — TOILET AND BATH', 'PHENOLIC BOARD PARTITION', 'DOOR INSTALLATION',
      'ELECTRICAL FIXTURES', 'PLUMBING INSTALLATION', 'SANITARY FIXTURES', 'SEPTIC TANK', 'RAMP RAILING'
    ]]
  ];
  const templates = {
    'SCHOOL BUILDING': building,
    'MULTI PURPOSE BUILDING': building,
    'COVERED COURT': [
      ['STRUCTURAL WORK', ['EXCAVATION', 'FOOTING AND TIE BEAMS', 'COLUMNS', 'ROOF BEAMS', 'ROOF TRUSSES / FRAME', 'ROOFING', 'SLAB ON FILL']],
      ['ARCHITECTURAL / COURT WORK', ['COURT FLOOR FINISH', 'PAINTING', 'COURT MARKINGS', 'RAMP AND RAILING']],
      ['ELECTRICAL / SITE WORK', ['ELECTRICAL ROUGH INSTALLATION', 'ELECTRICAL FIXTURES', 'SITE DRAINAGE']]
    ],
    'WATER SYSTEM': [
      ['CIVIL WORK', ['SOURCE / STORAGE SITE PREPARATION', 'FOUNDATION AND CONCRETE WORK', 'PUMP HOUSE / ENCLOSURE']],
      ['SOURCE AND STORAGE', ['WATER SOURCE / INTAKE', 'WATER STORAGE TANK / RESERVOIR']],
      ['PIPELINES AND DISTRIBUTION', ['PIPE TRENCH EXCAVATION', 'PIPE INSTALLATION', 'JOINTS AND VALVES', 'SERVICE CONNECTIONS', 'BACKFILL AND REINSTATEMENT']],
      ['PUMPS AND ELECTRICAL WORK', ['PUMP AND MOTOR INSTALLATION', 'ELECTRICAL CONNECTIONS AND CONTROLS']],
      ['TESTING AND COMMISSIONING', ['PRESSURE AND LEAK TESTING', 'FLUSHING AND DISINFECTION', 'OPERATIONAL TESTING', 'TURNOVER DOCUMENTATION']]
    ]
  };
  const uuid = () => rootCrypto().randomUUID();
  function rootCrypto() {
    if (!globalThis.crypto?.randomUUID) throw new Error('Open AMANAH using its secure HTTPS address.');
    return globalThis.crypto;
  }
  function newItem(name = 'NEW WORK ITEM', id = uuid) {
    return {id: id(), name, location: '', weight: 0, planned_start: null, planned_end: null};
  }
  function newGroup(name = 'NEW WORK GROUP', id = uuid) {
    return {id: id(), name, share: 0, items: []};
  }
  function template(type, id = uuid) {
    if (!types.includes(type)) throw new Error('This project type uses a different structure workflow.');
    return templates[type].map(([name, items]) => ({id: id(), name, share: 0, items: items.map(title => newItem(title, id))}));
  }
  const cents = value => Math.round(Number(value || 0) * 100);
  function groupSummary(group) {
    const assigned = group.items.reduce((sum, item) => sum + cents(item.weight), 0);
    return {assigned, remaining: 10000 - assigned, share: cents(group.share), unassigned: group.items.filter(item => cents(item.weight) <= 0).length};
  }
  function contribution(group, item) {
    return cents(group.share) * cents(item.weight) / 1000000;
  }
  function summary(groups) {
    const items = groups.flatMap(group => group.items);
    const assigned = groups.reduce((sum, group) => sum + cents(group.share), 0);
    const allocated = Math.round(groups.reduce((sum, group) => sum + cents(group.share) * groupSummary(group).assigned, 0) / 10000);
    return {groups: groups.length, items: items.length, assigned, remaining: 10000 - assigned, allocated,
      groupsUnassigned: groups.filter(group => cents(group.share) <= 0).length,
      incompleteGroups: groups.filter(group => !group.items.length || groupSummary(group).assigned !== 10000 || groupSummary(group).unassigned > 0).length,
      unassigned: items.filter(item => cents(item.weight) <= 0).length};
  }
  function validDate(value) {
    if (value == null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validate(groups, final = false) {
    if (!Array.isArray(groups) || groups.length > 20) throw new Error('Provide up to 20 work groups.');
    if (final && !groups.length) throw new Error('Add at least one work group.');
    const ids = new Set();
    const checkId = value => {
      if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) || ids.has(value)) throw new Error('Every group and work item must have a unique ID.');
      ids.add(value);
    };
    let count = 0;
    for (const group of groups) {
      checkId(group.id);
      if (typeof group.name !== 'string' || !group.name.trim() || group.name.trim().length > 100) throw new Error('Each group needs a name of 1 to 100 characters.');
      if (typeof group.share !== 'number' || !Number.isFinite(group.share) || group.share < 0 || group.share > 100 || Math.abs(group.share * 100 - cents(group.share)) > 0.000001) throw new Error('Group project shares must be between 0 and 100 with at most two decimal places.');
      if (final && group.share <= 0) throw new Error('Assign a positive project share to every work group.');
      if (!Array.isArray(group.items)) throw new Error('Invalid work item list.');
      if (final && !group.items.length) throw new Error('Every baseline group must contain work items.');
      for (const item of group.items) {
        if (++count > 400) throw new Error('A structure can contain up to 400 work items.');
        checkId(item.id);
        if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 200) throw new Error('Each work item needs a name of 1 to 200 characters.');
        if (typeof item.location !== 'string' || item.location.length > 160) throw new Error('A work location can contain up to 160 characters.');
        const weight = item.weight;
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100 || Math.abs(weight * 100 - cents(weight)) > 0.000001) throw new Error('Weights must be between 0 and 100 with at most two decimal places.');
        if (final && weight <= 0) throw new Error('Assign a positive weight to every work item before setting the baseline.');
        if (!validDate(item.planned_start) || !validDate(item.planned_end)) throw new Error('Use valid planned dates.');
        if (item.planned_start && item.planned_end && item.planned_end < item.planned_start) throw new Error('Planned finish cannot be before planned start.');
      }
      const allocation = groupSummary(group).assigned;
      if (allocation > 10000) throw new Error('Item shares in ' + group.name + ' cannot exceed 100%.');
      if (final && allocation !== 10000) throw new Error('Item shares in ' + group.name + ' must total exactly 100%.');
    }
    const totals = summary(groups);
    if (totals.assigned > 10000) throw new Error('Work group project shares cannot exceed 100%.');
    if (final && totals.assigned !== 10000) throw new Error('Work group project shares must total exactly 100% to set the baseline.');
    return totals;
  }
  function clean(groups) {
    return groups.map(group => ({id: group.id, name: group.name.trim(), share: Number(group.share), items: group.items.map(item => ({
      id: item.id, name: item.name.trim(), location: (item.location || '').trim(), weight: Number(item.weight),
      planned_start: item.planned_start || null, planned_end: item.planned_end || null
    }))}));
  }
  return {types: Object.freeze(types), template, newItem, newGroup, summary, groupSummary, contribution, validate, clean, cents};
});
