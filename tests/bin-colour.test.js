// Regression tests for bin colour classification embedded in index.html.
// Run with: node --test tests/bin-colour.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function colorForBin(name)');
const end = html.indexOf('\nfunction parseBinDate', start);
assert.ok(start >= 0 && end > start, 'colorForBin function must exist');
const sandbox = { module: { exports: {} }, String };
vm.runInNewContext(html.slice(start, end) + '\nmodule.exports = colorForBin;', sandbox, { timeout: 1000 });
const colorForBin = sandbox.module.exports;
test('green bin stays green when its label is explicit', () => assert.equal(colorForBin('Green Bin'), 'green'));
test('plastic recycling is green', () => assert.equal(colorForBin('Green — Plastic recycling'), 'green'));
test('paper and cardboard recycling is blue', () => assert.equal(colorForBin('Blue — Paper and cardboard recycling'), 'blue'));
test('brown garden waste is brown', () => assert.equal(colorForBin('Brown — Food and garden waste'), 'brown'));
test('general waste is grey', () => assert.equal(colorForBin('Grey — General waste'), 'grey'));
test('unknown bin types retain safe blue fallback', () => assert.equal(colorForBin('Collection'), 'blue'));
