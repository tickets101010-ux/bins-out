const KEY='binsout_v2_saved';
const BINAPI='https://ukbinday.co.uk/api/v2';
const UPRNAPI='https://api.uprns.io';
const OSM='https://nominatim.openstreetmap.org/reverse';
const ALLOWED_LADS=new Set(['S12000049','S12000011']); // Glasgow City, East Renfrewshire
let current=null,deferred=null;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pc=s=>s.trim().toUpperCase().replace(/\s+/g,' ');
const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

function msg(t,e=false){
  $('#status').innerHTML=t;
  $('#status').className='status '+(e?'error':'');
  $('#status').classList.remove('hidden');
}
function hide(){ $('#status').classList.add('hidden'); }

async function get(u){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(u,{headers:{Accept:'application/json'},signal:ctl.signal});
    let j={};
    try{j=await r.json()}catch{}
    if(!r.ok) throw Error(j.detail||j.error||'Live service unavailable');
    return j;
  }catch(e){
    if(e.name==='AbortError') throw Error('The live service took too long to respond.');
    throw e;
  }finally{clearTimeout(timer)}
}

async function addressFor(u){
  // uprns.io deliberately returns coordinates/geography, not a postal address.
  // Use any address-like fields if a future provider supplies them, then reverse-geocode.
  const direct=u.address||u.display_name||u.label||u.formatted_address||u.property_address||'';
  if(direct)return String(direct);
  if(u.latitude==null||u.longitude==null)return '';
  try{
    const d=await get(OSM+'?lat='+encodeURIComponent(u.latitude)+'&lon='+encodeURIComponent(u.longitude)+'&format=jsonv2&zoom=18&addressdetails=1&layer=address');
    const a=d.address||{};
    const bits=[a.house_number,a.house_name,a.road,a.neighbourhood,a.suburb,a.town,a.city,a.postcode].filter(Boolean);
    return bits.length?bits.join(', '):(d.display_name||'');
  }catch{return ''}
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferred=e; $('#install').classList.remove('hidden');
});
$('#install').onclick=async()=>{
  if(deferred){await deferred.prompt();deferred=null;$('#install').classList.add('hidden')}
};

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

$('#form').onsubmit=async e=>{
  e.preventDefault();
  const p=pc($('#postcode').value);
  if(!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(p))
    return msg('Please enter a valid UK postcode.','error');

  $('#addresses').innerHTML='';
  $('#schedule').classList.add('hidden');
  msg('Finding the council and properties…');

  try{
    const [council,page]=await Promise.all([
      get(BINAPI+'/find?postcode='+encodeURIComponent(p)),
      get(UPRNAPI+'/postcodes/'+encodeURIComponent(p)+'?page=1')
    ]);

    const lad=council.lad_code||council.ladCode||council.council;
    if(!lad) throw Error('No collecting council was found for that postcode.');
    if(!ALLOWED_LADS.has(lad)) throw Error('Bins Out currently supports Glasgow City Council and East Renfrewshire Council only.');

    const providerAddresses=Array.isArray(council.addresses)?council.addresses.filter(x=>x&&x.uprn):[];
    const ids=(providerAddresses.length?providerAddresses:(page.uprns||page.results||page.addresses||[])).map(x=>typeof x==='string'?x:x.uprn||x.id).filter(Boolean);
    if(!ids.length) throw Error('No properties were found for that postcode.');

    msg('Found '+ids.length+' properties. Loading addresses…');
    const rows=[];
    $('#addresses').innerHTML='<div class="status">Loading property addresses…</div>';

    for(let i=0;i<ids.length;i++){
      try{
        const u=await get(UPRNAPI+'/uprns/'+encodeURIComponent(ids[i]));
        const provider=providerAddresses.find(x=>String(x.uprn)===String(ids[i]));
        rows.push({
          uprn:String(ids[i]),
          lat:u.latitude,lon:u.longitude,
          label:String(provider?.address||provider?.label||provider?.name||'')||await addressFor(u),
          postcode:p,lad
        });
        showAddresses(rows,false);
        msg('Loaded '+(i+1)+' of '+ids.length+' properties. Select yours.');
      }catch{}
    }

    if(!rows.length) throw Error('The postcode service returned properties, but they could not be read.');
    showAddresses(rows,true);
  }catch(x){
    msg(esc(x.message)+'<br><small>No collection date has been invented.</small>','error');
  }
};

function showAddresses(a,done){
  $('#addresses').innerHTML=a.map((x,i)=>{
    const title=x.label||('Property '+(i+1)+' — UPRN '+x.uprn);
    return '<button class="address" data-i="'+i+'"><span>'+esc(title)+'</span><small>UPRN '+esc(x.uprn)+'</small></button>';
  }).join('');
  document.querySelectorAll('.address').forEach(b=>b.onclick=()=>load(a[+b.dataset.i]));
  if(done && !a.some(x=>x.label)){
    $('#addresses').insertAdjacentHTML('beforebegin','<div class="status">Addresses could not be named automatically, so the UPRNs are shown. You can still select the property.</div>');
  }
}

async function load(c){
  current=c;
  $('#schedule').classList.add('hidden');
  msg('Loading live collection dates…');
  try{
    const qs='?postcode='+encodeURIComponent(c.postcode)+(c.label?'&address='+encodeURIComponent(c.label):'');
    const d=await get(BINAPI+'/'+encodeURIComponent(c.lad)+'/view/'+encodeURIComponent(c.uprn)+qs);
    render(c,d);
  }catch(x){
    msg(esc(x.message)+'<br><small>The council may be doing a live scrape. Try the address again in a few seconds.</small>','error');
  }
}

function render(c,d){
  const raw=d.dates||d.collections||d.events||d.results||[];
  const a=(Array.isArray(raw)?raw:Object.values(raw||{})).map(x=>{
    const dt=x.date||x.collection_date||x.collectionDate;
    const ty=x.type||x.bin_type||x.binType||x.service||x.wasteType||x.name||x.waste||x.description||'Collection';
    return dt?{date:String(dt).slice(0,10),type:String(ty)}:null;
  }).filter(x=>x&&/^\d{4}-\d\d-\d\d$/.test(x.date)).sort((x,y)=>x.date.localeCompare(y.date));

  if(!a.length) return msg('The property was found, but the council returned no collection dates.','error');

  hide();
  $('#schedule').classList.remove('hidden');
  $('#addressTitle').textContent=c.label||('UPRN '+c.uprn);
  $('#council').textContent=d.council_name||d.council||d.authority||c.lad||'UK collection service';

  const u=[];
  a.forEach(x=>{if(!u.some(y=>y.type===x.type))u.push(x)});
  $('#next').innerHTML=u.slice(0,6).map(x=>'<div class="bin"><b>'+esc(x.type)+'</b><strong>'+date(x.date)+'</strong><small>Next collection</small></div>').join('');
  $('#upcoming').innerHTML='<h3>Upcoming collections</h3>'+a.slice(0,20).map(x=>'<div class="event"><span>'+esc(x.type)+'</span><b>'+date(x.date)+'</b></div>').join('');
  $('#save').textContent=saved().some(x=>x.uprn===c.uprn)?'Saved':'Save address';
}

function saved(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}

function drawSaved(){
  const a=saved();
  if(!a.length)return $('#saved').classList.add('hidden');
  $('#saved').classList.remove('hidden');
  $('#savedList').innerHTML=a.map((x,i)=>'<div class="savedRow"><div><b>'+esc(x.label||('UPRN '+x.uprn))+'</b><small>'+esc(x.postcode)+'</small></div><button class="ghost small" data-i="'+i+'">View</button></div>').join('');
  document.querySelectorAll('#savedList button').forEach(b=>b.onclick=()=>load(a[+b.dataset.i]));
}

$('#save').onclick=()=>{
  if(!current)return;
  let a=saved().filter(x=>x.uprn!==current.uprn);
  a.unshift(current);
  localStorage.setItem(KEY,JSON.stringify(a.slice(0,20)));
  drawSaved();
  $('#save').textContent='Saved';
};

$('#refresh').onclick=()=>current?load(current):drawSaved();
drawSaved();