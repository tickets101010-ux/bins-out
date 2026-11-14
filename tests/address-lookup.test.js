// Regression tests for the current Bins Out routing.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const worker=fs.readFileSync(path.join(__dirname,'..','worker.js'),'utf8');

test('Glasgow uses the dedicated live schedule worker',()=>{
  assert.match(app,/CONNECTOR\+'\/glasgow-schedule/);
  assert.match(worker,/u\.pathname===\"\/glasgow-schedule\"/);
});
test('Glasgow schedule resolver only accepts real UPRN fields',()=>{
  assert.match(worker,/attributes\?\.UPRN\|\|c\.attributes\?\.uprn/);
  assert.doesNotMatch(worker,/attributes\?\.LOCATOR_ID\|\|c\.attributes\?\.Locator_ID/);
});
test('Glasgow flat matching normalises a leading Flat label',()=>{
  assert.match(worker,/replace\(\/\^FLAT\\\\s\+/);
});
test('saved-address UI can access the live current address',()=>{
  assert.match(app,/Object\.defineProperty\(window,'current'/);
});
test('PWA asset version is current',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/app\.js\?v=47/);
  assert.match(html,/ui\.js\?v=47/);
});
