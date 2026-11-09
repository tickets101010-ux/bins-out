const KEY='binsout_v2_saved';
const WB='https://whenisbins.com/v1';
const ALLOWED=new Set(['S12000049','S12000011']);
let current=null,deferred=null;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pc=s=>s.trim().toUpperCase().replace(/\\s+/g,' ');
const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

function msg(t,e=false){$('#status').innerHTML=t;$('#status').className='status '+(e?'error':'');$('#status').classList.remove('hidden')}
function hide(){$('#status').classList.add('hidden')}

async function getJSON(url,opts={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(url,{...opts,headers:{Accept:'application/json',...(opts.headers||{})},signal:ctl.signal});
    const text=await r.text(); let j={}; try{j=JSON.parse(text)}catch{}
    if(!r.ok)throw Error(j.detail||j.error||j.problem||('Live service returned HTTP '+r.status));
    return j;
  }catch(e){
    if(e.name==='AbortError')throw Error('The live service took too long to respond.');
    throw e;
  }finally{clearTimeout(timer)}
}

function addressLabel(x){
  return String(x?.label||x?.address||x?.matched_address||x?.name||'').trim();
}

async function findAddresses(postcode){
  const base=await getJSON(WB+'/addresses?postcode='+encodeURIComponent(postcode));
  let candidates=Array.isArray(base.candidates)?base.candidates:[];
  if(!candidates.length){
    const ri=base.required_input||base.detail||'';
    throw Error(ri?'The service could not find a property for that postcode.':'No properties were returned for that postcode.');
  }

  // Some postcode responses are deliberately narrow. When the returned
  // properties reveal a street, ask the service for that street as well;
  // this exposes the rest of the council's property list without guessing
  // house numbers.
  const labels=candidates.map(addressLabel);
  const streets=[];
  for(const label of labels){
    const m=label.match(/^\\d+[A-Z]?\\s+(.+?),\\s+GLASGOW,\\s+G\\d/i);
    if(m)streets.push(m[1].trim());
    else{
      const parts=label.split(',').map(x=>x.trim());
      if(parts.length>=3 && /drive|road|street|avenue|lane|place|crescent|court|terrace|way|close|gardens|park/i.test(parts[1])) streets.push(parts[1]);
    }
  }
  const street=[...new Set(streets)][0];
  if(street && candidates.length<20){
    try{
      const q=await getJSON(WB+'/addresses?postcode='+encodeURIComponent(postcode)+'&q='+encodeURIComponent(street));
      const extra=Array.isArray(q.candidates)?q.candidates:[];
      const seen=new Set(candidates.map(x=>String(x.id)));
      for(const x of extra)if(!seen.has(String(x.id))){candidates.push(x);seen.add(String(x.id))}
    }catch{}
  }
  return {candidates,council:base.council||base.collecting_council||null,required:base.required_input||'property_id',input_options:base.input_options||[]};
}

function showCandidates(a){
  $('#addresses').innerHTML=a.map((x,i)=>{
    const label=addressLabel(x)||('Property '+(i+1));
    return '<button class="address" data-i="'+i+'"><span>'+esc(label)+'</span><small>Exact property</small></button>';
  }).join('');
  document.querySelectorAll('.address').forEach(b=>b.onclick=()=>selectAddress(a[+b.dataset.i]));
}

async function selectAddress(x){
  current={postcode:pc($('#postcode').value),property_id:x.id,label:addressLabel(x),council:x.council||null};
  $('#schedule').classList.add('hidden');
  msg('Checking the collection schedule…');
  try{
    const q='?property_id='+encodeURIComponent(x.id);
    const cal=await getJSON(WB+'/calendar-url'+q);
    const url=String(cal?.calendar_url||cal?.url||cal?.data||'').trim();
    if(url){
      current.calendar_url=url;
      renderCalendarLink();
      return;
    }
  }catch{}
  msg('Address found: '+esc(current.label||'selected property')+'<br><small>The exact address is confirmed, but a stored collection calendar is not currently available.</small>','error');
}

function renderCalendarLink(){
  hide();
  $('#schedule').classList.remove('hidden');
  $('#addressTitle').textContent=current.label||'Selected property';
  $('#council').textContent=current.council?.name||'Collection schedule';
  $('#next').innerHTML='<div class="bin"><b>Live calendar available</b><strong>Open calendar</strong><small>Official collection schedule supplied by the live service</small></div>';
  $('#upcoming').innerHTML='<h3>Collection calendar</h3><p class="muted">The exact property was matched. Use the live calendar to see the current collection dates.</p><p><a href="'+esc(current.calendar_url)+'" target="_blank" rel="noopener">Open collection calendar</a></p>';
  $('#save').textContent=saved().some(x=>x.property_id===current.property_id)?'Saved':'Save address';
}

async function find(){
  const p=pc($('#postcode').value);
  if(!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(p))return msg('Please enter a valid UK postcode.','error');
  $('#addresses').innerHTML='';$('#schedule').classList.add('hidden');msg('Finding the exact properties…');
  try{
    const d=await findAddresses(p);
    const councilId=d.council?.id||d.council?.gss||'';
    if(councilId&&!ALLOWED.has(councilId))throw Error('Bins Out currently supports Glasgow City Council and East Renfrewshire Council only.');
    showCandidates(d.candidates);
    hide();
    msg('Found '+d.candidates.length+' exact property option'+(d.candidates.length===1?'':'s')+'. Select yours.');
  }catch(e){msg(esc(e.message)+'<br><small>No collection date has been invented.</small>','error')}
}

$('#form').onsubmit=e=>{e.preventDefault();find()};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#install').classList.remove('hidden')});
$('#install').onclick=async()=>{if(deferred){await deferred.prompt();deferred=null;$('#install').classList.add('hidden')}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

function saved(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function drawSaved(){
  const a=saved();if(!a.length)return $('#saved').classList.add('hidden');
  $('#saved').classList.remove('hidden');
  $('#savedList').innerHTML=a.map((x,i)=>'<div class="savedRow"><div><b>'+esc(x.label||('Property '+x.property_id))+'</b><small>'+esc(x.postcode)+'</small></div><button class="ghost small" data-i="'+i+'">View</button></div>').join('');
  document.querySelectorAll('#savedList button').forEach(b=>b.onclick=()=>selectAddress(a[+b.dataset.i]));
}
$('#save').onclick=()=>{if(!current)return;let a=saved().filter(x=>x.property_id!==current.property_id);a.unshift(current);localStorage.setItem(KEY,JSON.stringify(a.slice(0,20)));drawSaved();$('#save').textContent='Saved'};
$('#refresh').onclick=()=>drawSaved();
drawSaved();