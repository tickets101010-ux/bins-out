const KEY='binsout_v2_saved';
const WB='https://whenisbins.com/v1';
const ALLOWED=new Set(['S12000049','S12000011']);
let current=null,deferred=null;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pc=s=>s.trim().toUpperCase().replace(/\s+/g,' ');
const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

function msg(t,e=false){$('#status').innerHTML=t;$('#status').className='status '+(e?'error':'');$('#status').classList.remove('hidden')}
function hide(){$('#status').classList.add('hidden')}

async function getJSON(url,opts={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    let r;
    try{
      r=await fetch(url,{...opts,headers:{Accept:'application/json',...(opts.headers||{})},signal:ctl.signal});
    }catch(e){
      // GET address discovery is public and browser-readable. If a particular
      // mobile network/browser blocks the direct request, use a GET-only proxy
      // as a last resort. POST lookup data never goes through the proxy.
      if((opts.method||'GET').toUpperCase()!=='GET')throw e;
      const proxy='https://api.allorigins.win/raw?url='+encodeURIComponent(url);
      r=await fetch(proxy,{headers:{Accept:'application/json'},signal:ctl.signal});
    }
    const text=await r.text();let j={};try{j=JSON.parse(text)}catch{}
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

function addRows(all,seen,rows){
  for(const x of Array.isArray(rows)?rows:[]){
    const id=String(x?.id||x?.uprn||x?.property_id||addressLabel(x));
    if(id&&!seen.has(id)){seen.add(id);all.push(x)}
  }
}

async function getText(url){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    let r;
    try{r=await fetch(url,{headers:{Accept:'text/html,application/json'},signal:ctl.signal})}
    catch(e){r=await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(url),{signal:ctl.signal})}
    if(!r.ok)throw Error('Live service returned HTTP '+r.status);
    return await r.text();
  }catch(e){
    if(e.name==='AbortError')throw Error('The live service took too long to respond.');
    throw e;
  }finally{clearTimeout(timer)}
}

function normAddress(s){
  return String(s||'').toUpperCase().replace(/\\bST\\b/g,'STREET').replace(/\\bRD\\b/g,'ROAD').replace(/\\bAVE\\b/g,'AVENUE').replace(/\\bCRES\\b/g,'CRESCENT').replace(/\\bDR\\b/g,'DRIVE').replace(/\\bLN\\b/g,'LANE').replace(/\\bGDNS\\b/g,'GARDENS').replace(/\\bPL\\b/g,'PLACE').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\\s+/g,' ');
}

async function glasgowAddresses(postcode){
  const u='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-Address/GEOCODESERVICE/GeocodeServer/findAddressCandidates?SingleLine='+encodeURIComponent(postcode)+'&f=json&maxLocations=100&outFields=*';
  const d=JSON.parse(await getText(u));
  const rows=Array.isArray(d?.candidates)?d.candidates:[];
  const seen=new Set(),out=[];
  for(const c of rows){
    const label=String(c?.address||c?.attributes?.Match_addr||'').trim();
    const id=String(c?.attributes?.LOCATOR_ID||c?.attributes?.Locator_ID||c?.attributes?.LOCATOR_DESCRIPTION||'').trim();
    if(!label||!id||seen.has(label))continue;
    seen.add(label);
    out.push({id,label,postcode,council:{id:'S12000049',name:'Glasgow City Council'}});
  }
  out.sort((a,b)=>{
    const na=parseInt((a.label.match(/^\\d+/)||['999999'])[0],10);
    const nb=parseInt((b.label.match(/^\\d+/)||['999999'])[0],10);
    return na-nb||a.label.localeCompare(b.label);
  });
  if(!out.length)throw Error('Glasgow returned no properties for that postcode.');
  return {candidates:out,council:{id:'S12000049',name:'Glasgow City Council'},required:'property_id',input_options:[]};
}

async function findAddresses(postcode){
  const seen=new Set(),all=[];
  let council=null;

  async function query(q=''){
    const u=WB+'/addresses?postcode='+encodeURIComponent(postcode)+(q?'&q='+encodeURIComponent(q):'');
    const d=await getJSON(u);
    if(!council)council=d.council||d.collecting_council||null;
    addRows(all,seen,d.candidates);
    return d;
  }

  const first=await query();

  // Glasgow's own address gazetteer is the authoritative property list.
  // Use it instead of the abbreviated WhenIsBins candidate batch.
  if((council?.id||council?.gss)==='S12000049')return glasgowAddresses(postcode);

  const opts=first?.input_options;
  const choices=Array.isArray(opts?.options)?opts.options:[];
  for(const o of choices){
    const value=String(o?.value??o?.id??o?.label??'').trim();
    if(!value)continue;
    try{await query(value)}catch(e){}
  }

  if(!choices.length&&all.length){
    const streets=new Set();
    for(const x of all){
      const label=addressLabel(x).replace(/^\\s*\\d+[A-Z]?\\s+/i,'');
      const parts=label.split(',').map(s=>s.trim()).filter(Boolean);
      if(parts.length>=2)streets.add(parts[0]);
    }
    for(const street of streets)try{await query(street)}catch(e){}
  }

  if(!all.length)throw Error('No properties were returned for that postcode.');
  all.sort((a,b)=>{
    const na=parseInt((addressLabel(a).match(/^\\d+/)||['999999'])[0],10);
    const nb=parseInt((addressLabel(b).match(/^\\d+/)||['999999'])[0],10);
    return na-nb;
  });
  return {candidates:all,council,required:'property_id',input_options:[]};
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
    // Glasgow uses its own public UPRN locator and collection calendar.
    // This avoids the browser-restricted POST /lookups route entirely.
    if((current.council?.id||current.council?.gss)==='S12000049'){
      const q='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-UPRN/GEOCODESERVICE/GeocodeServer/findAddressCandidates?SingleLine='+encodeURIComponent(current.label+', '+current.postcode)+'&f=json&maxLocations=10&outFields=*';
      const gd=JSON.parse(await getText(q));
      const cs=Array.isArray(gd?.candidates)?gd.candidates:[];
      const wanted=normAddress(current.label);
      const ranked=cs.map(c=>{
        const addr=String(c?.address||c?.attributes?.Match_addr||'').trim();
        const uprn=String(c?.attributes?.UPRN||c?.attributes?.uprn||c?.attributes?.LOCATOR_ID||c?.attributes?.Locator_ID||'').trim();
        const n=normAddress(addr);
        return {addr,uprn,score:(n===wanted?3:(n.includes(wanted)?2:(wanted.includes(n)?1:0)))};
      }).filter(c=>/^\\d{1,12}$/.test(c.uprn)).sort((a,b)=>b.score-a.score);
      if(!ranked.length||ranked[0].score<2)throw Error('Glasgow could not match that exact property to a UPRN.');
      const uprn=ranked[0].uprn;
      const calUrl='https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN='+encodeURIComponent(uprn);
      const html=await getText(calUrl);
      const plain=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/\\s+/g,' ').trim();
      const re=/Your next ([A-Za-z ]+?) day is ([A-Za-z]+ \\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+ \\d{4}|Tomorrow|Today)\\./gi;
      const bins=[];let m;
      while((m=re.exec(plain)))bins.push({name:m[1].trim(),dateText:m[2].trim()});
      if(!bins.length)throw Error('Glasgow returned the property calendar but no collection dates were readable.');
      current.uprn=uprn;
      current.schedule={confirmed:true,bins};
      hide();
      $('#schedule').classList.remove('hidden');
      $('#addressTitle').textContent=ranked[0].addr||current.label;
      $('#council').textContent='Glasgow City Council';
      $('#next').innerHTML='<div class="bin"><b>Next collection</b><strong>'+esc(bins[0].name)+'</strong><small>'+esc(bins[0].dateText)+'</small></div>';
      $('#upcoming').innerHTML='<h3>Upcoming collections</h3>'+bins.map(v=>'<div class="savedRow"><div><b>'+esc(v.name)+'</b><small>'+esc(v.dateText)+'</small></div></div>').join('');
      $('#save').textContent=saved().some(v=>v.property_id===current.property_id)?'Saved':'Save address';
      return;
    }

    // Other supported councils use the documented asynchronous lookup journey.
    const key=crypto.randomUUID();
    const created=await getJSON(WB+'/lookups',{
      method:'POST',
      headers:{'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({postcode:current.postcode,property_id:x.id})
    });
    let state=created,id=String(created?.id||created?.lookup_id||'');
    if(!id)throw Error(created?.detail||'The collection lookup did not return an ID.');
    for(let i=0;i<12;i++){
      const s=String(state?.status||'').toLowerCase();
      if(s==='done')return renderSchedule(state.result||state.schedule||state);
      if(s==='failed')throw Error(state.detail||state.problem||'The council lookup failed.');
      const wait=Math.max(5,Number(state.retry_after_seconds||state.retryAfterSeconds||5));
      await new Promise(r=>setTimeout(r,wait*1000));
      state=await getJSON(WB+'/lookups/'+encodeURIComponent(id));
    }
    throw Error('The council lookup is taking longer than usual. Please try again in a moment.');
  }catch(e){
    msg(esc(e.message)+'<br><small>No collection date has been invented.</small>','error');
  }
}
function renderSchedule(r){
  const bins=[];
  for(const c of (Array.isArray(r?.collections)?r.collections:[])){
    for(const d of (Array.isArray(c?.dates)?c.dates:[])){
      const ds=typeof d==='string'?d:d?.date;
      if(ds)bins.push({date:ds,name:c.name||c.waste_type||'Collection'});
    }
  }
  current.schedule={confirmed:true,bins};
  hide();
  $('#schedule').classList.remove('hidden');
  $('#addressTitle').textContent=r?.matched_address||current.label||'Selected property';
  $('#council').textContent=r?.council?.name||current.council?.name||'Collection schedule';
  const upcoming=bins.filter(b=>new Date(b.date)>=new Date(new Date().toDateString())).sort((a,b)=>a.date.localeCompare(b.date));
  if(!upcoming.length){
    $('#next').innerHTML='<div class="bin"><b>No dated collections returned</b><small>The council did not provide a concrete date in this result.</small></div>';
  }else{
    const n=upcoming[0];
    $('#next').innerHTML='<div class="bin"><b>Next collection</b><strong>'+esc(n.name)+'</strong><small>'+esc(date(n.date))+'</small></div>';
  }
  $('#upcoming').innerHTML='<h3>Upcoming collections</h3>'+(
    upcoming.length
      ? '<div>'+upcoming.slice(0,12).map(b=>'<div class="savedRow"><div><b>'+esc(b.name)+'</b><small>'+esc(date(b.date))+'</small></div></div>').join('')+'</div>'
      : '<p class="muted">No concrete collection dates were supplied.</p>'
  );
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
