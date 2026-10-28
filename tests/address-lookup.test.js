// Regression tests for council-specific collection routing and address confidence.
// Run with: node --test tests/address-lookup.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const start = html.indexOf('function isEastRenfrewshireCouncil(value)');
const end = html.indexOf('async function lookupCollections()', start);
assert.ok(start >= 0 && end > start, 'council routing helpers must exist in index.html');
const source = html.slice(start, end) + '\nmodule.exports = { isEastRenfrewshireCouncil, shouldUseGlasgowCalendar, shouldUseUkBinDay };';
const sandbox = { module: { exports: {} }, String, Boolean, RegExp };
vm.runInNewContext(source, sandbox, { timeout: 1000 });
const { isEastRenfrewshireCouncil, shouldUseGlasgowCalendar, shouldUseUkBinDay } = sandbox.module.exports;

test('recognises East Renfrewshire regardless of case and spacing', () => {
  assert.equal(isEastRenfrewshireCouncil('East Renfrewshire Council'), true);
  assert.equal(isEastRenfrewshireCouncil(' EAST   RENFREWSHIRE '), true);
  assert.equal(isEastRenfrewshireCouncil('Glasgow City Council'), false);
});

test('uses Glasgow official calendar only when a UPRN exists', () => {
  assert.equal(shouldUseGlasgowCalendar('123456789012', 'Glasgow City Council'), true);
  assert.equal(shouldUseGlasgowCalendar('', 'Glasgow City Council'), false);
  assert.equal(shouldUseGlasgowCalendar('123456789012', 'East Renfrewshire Council'), false);
});

test('routes East Renfrewshire UPRNs through the council lookup provider', () => {
  assert.equal(shouldUseUkBinDay('123456789012', 'East Renfrewshire Council'), false);
  assert.equal(shouldUseUkBinDay('123456789012', 'east   renfrewshire'), false);
});

test('keeps generic UPRN lookup for other councils', () => {
  assert.equal(shouldUseUkBinDay('123456789012', 'South Lanarkshire Council'), true);
  assert.equal(shouldUseUkBinDay('', 'South Lanarkshire Council'), false);
  assert.equal(shouldUseUkBinDay('123456789012', 'Glasgow City Council'), false);
});

test('does not save a neighbouring-property or provisional schedule', () => {
  assert.match(html, /result\.provisional===true\|\|result\.address_match===\"postcode_representative\"/);
  assert.match(html, /Exact property not confirmed — dates not saved/);
});

test('supports councils that require a selected property ID', () => {
  assert.match(html, /whenIsBinsRequiredInput===\"property_id\"/);
  assert.match(html, /payload\.property_id=selectedWhenIsBinsPropertyId/);
});
