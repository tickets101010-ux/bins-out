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
  return String(s||'').toUpperCase().replace(/\bST\b/g,'STREET').replace(/\bRD\b/g,'ROAD').replace(/\bAVE\b/g,'AVENUE').replace(/\bCRES\b/g,'CRESCENT').replace(/\bDR\b/g,'DRIVE').replace(/\bLN\b/g,'LANE').replace(/\bGDNS\b/g,'GARDENS').replace(/\bPL\b/g,'PLACE').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

async function glasgowAddresses(postcode){
  const u='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-Address/GEOCODESERVICE/GeocodeServer/findAddressCandidates?SingleLine='+encodeURIComponent(postcode)+'&f=json&maxLocations=100&outFields=*';
  const d=JSON.parse(await getText(u));
  const rows=Array.isArray(d?.candidates)?d.candidates:[];
  const seen=new Set(),out=[];
  for(const c of rows){
    const label=String(c?.address||c?.attributes?.Match_addr||'').trim();
    const id=String(c?.attributes?.UPRN||c?.attributes?.uprn||c?.attributes?.LOCATOR_ID||c?.attributes?.Locator_ID||c?.attributes?.LOCATOR_DESCRIPTION||'').trim();
    if(!label||!id||seen.has(label))continue;
    seen.add(label);
    out.push({id,label,postcode,x:c?.attributes?.X??c?.x,y:c?.attributes?.Y??c?.y,attrs:c?.attributes||{},council:{id:'S12000049',name:'Glasgow City Council'}});
  }
  out.sort((a,b)=>{
    const na=parseInt((a.label.match(/^\d+/)||['999999'])[0],10);
    const nb=parseInt((b.label.match(/^\d+/)||['999999'])[0],10);
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
      const label=addressLabel(x).replace(/^\s*\d+[A-Z]?\s+/i,'');
      const parts=label.split(',').map(s=>s.trim()).filter(Boolean);
      if(parts.length>=2)streets.add(parts[0]);
    }
    for(const street of streets)try{await query(street)}catch(e){}
  }

  if(!all.length)throw Error('No properties were returned for that postcode.');
  all.sort((a,b)=>{
    const na=parseInt((addressLabel(a).match(/^\d+/)||['999999'])[0],10);
    const nb=parseInt((addressLabel(b).match(/^\d+/)||['999999'])[0],10);
    return na-nb;
  });
  return {candidates:all,council,required:'property_id',input_options:[]};
}
function showCandidates(a){
  const rows=[...a].sort((x,y)=>{
    const ax=addressLabel(x),ay=addressLabel(y);
    const mx=ax.match(/\b(\d+)\s*([A-Z]?)\b/i),my=ay.match(/\b(\d+)\s*([A-Z]?)\b/i);
    const nx=mx?Number(mx[1]):999999,ny=my?Number(my[1]):999999;
    return nx-ny||(mx?.[2]||'').localeCompare(my?.[2]||'')||ax.localeCompare(ay);
  });
  $('#addresses').innerHTML=rows.map((x,i)=>{
    const label=addressLabel(x)||('Property '+(i+1));
    return '<button type="button" class="address" data-i="'+i+'" aria-pressed="false"><span>'+esc(label)+'</span><small>Tap to select</small></button>';
  }).join('');
  document.querySelectorAll('.address').forEach(b=>b.onclick=async()=>{
    document.querySelectorAll('.address').forEach(v=>{
      v.classList.remove('selected');v.setAttribute('aria-pressed','false');
      const s=v.querySelector('small');if(s)s.textContent='Tap to select';
    });
    b.classList.add('selected');b.setAttribute('aria-pressed','true');
    const s=b.querySelector('small');if(s)s.textContent='✓ Selected — checking live schedule…';
    b.scrollIntoView({block:'nearest',behavior:'smooth'});
    await selectAddress(rows[+b.dataset.i]);
  });
}

async function fetchText(url){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    let r;
    try{
      r=await fetch(url,{headers:{Accept:'text/plain,text/calendar,application/json'},signal:ctl.signal});
    }catch(e){
      r=await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(url),{signal:ctl.signal});
    }
    if(!r.ok)throw Error('Live service returned HTTP '+r.status);
    return await r.text();
  }catch(e){
    if(e.name==='AbortError')throw Error('The live service took too long to respond.');
    throw e;
  }finally{clearTimeout(timer)}
}

function parseICS(text){
  const unfolded=String(text||'').replace(/\r?\n[ \t]/g,'');
  const lines=unfolded.split(/\r?\n/),out=[];
  let ev=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){ev={};continue}
    if(line==='END:VEVENT'){
      if(ev?.date)out.push({date:ev.date,name:ev.name||'Collection'});
      ev=null;continue
    }
    if(!ev)continue;
    if(line.startsWith('DTSTART')){
      const v=line.split(':').slice(1).join(':').trim();
      const m=v.match(/^(\\d{4})(\\d{2})(\\d{2})/);
      if(m)ev.date=m[1]+'-'+m[2]+'-'+m[3];
    }else if(line.startsWith('SUMMARY:'))ev.name=line.slice(8).trim();
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}

function parseGlasgowCalendar(html){
  const plain=String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&#39;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/\s+/g,' ')
    .trim();

  const found=[];
  const add=(name,raw)=>{
    const s=String(raw||'').trim();
    if(/^Tomorrow$/i.test(s)){
      const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+1);
      found.push({date:d.toISOString().slice(0,10),name:name.trim().replace(/\s+/g,' ')});
      return;
    }
    const m=s.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if(!m)return;
    const months={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
    const d=new Date(Number(m[3]),months[m[2].toLowerCase()],Number(m[1]),12);
    if(!Number.isNaN(d.getTime()))found.push({date:d.toISOString().slice(0,10),name:name.trim().replace(/\s+/g,' ')});
  };

  let m;
  const re=/Your\s+next\s+([A-Za-z][A-Za-z &'-]*?)\s+day\s+is\s+((?:Tomorrow)|(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/gi;
  while((m=re.exec(plain)))add(m[1],m[2]);

  return [...new Map(found.map(x=>[x.name+'|'+x.date,x])).values()]
    .sort((a,b)=>a.date.localeCompare(b.date));
}

function bngToWgs84(E,N){
  E=Number(E);N=Number(N);
  if(!Number.isFinite(E)||!Number.isFinite(N))return null;
  const a=6377563.396,b=6356256.909,F0=.9996012717,lat0=49*Math.PI/180,lon0=-2*Math.PI/180,N0=-100000,E0=400000;
  const e2=1-(b*b)/(a*a),n=(a-b)/(a+b);
  let lat=lat0,M=0;
  do{
    lat=(N-N0-M)/(a*F0)+lat;
    M=b*F0*((1+n+1.25*n*n+1.25*n*n*n)*(lat-lat0)
      -(3*n+3*n*n+2.625*n*n*n)*Math.sin(lat-lat0)*Math.cos(lat+lat0)
      +(1.875*n*n+1.875*n*n*n)*Math.sin(2*(lat-lat0))*Math.cos(2*(lat+lat0))
      -(35/24)*n*n*n*Math.sin(3*(lat-lat0))*Math.cos(3*(lat+lat0)));
  }while(Math.abs(N-N0-M)>=.00001);
  const sin=Math.sin(lat),cos=Math.cos(lat),tan=Math.tan(lat);
  const nu=a*F0/Math.sqrt(1-e2*sin*sin),rho=a*F0*(1-e2)/Math.pow(1-e2*sin*sin,1.5),eta2=nu/rho-1;
  const dE=E-E0;
  const VII=tan/(2*rho*nu);
  const VIII=tan/(24*rho*Math.pow(nu,3))*(5+3*tan*tan+eta2-9*tan*tan*eta2);
  const IX=tan/(720*rho*Math.pow(nu,5))*(61+90*tan*tan+45*Math.pow(tan,4));
  const X=1/(cos*nu);
  const XI=1/(6*cos*Math.pow(nu,3))*(nu/rho+2*tan*tan);
  const XII=1/(120*cos*Math.pow(nu,5))*(5+28*tan*tan+24*Math.pow(tan,4));
  const latOS=lat-VII*dE*dE+VIII*Math.pow(dE,4)-IX*Math.pow(dE,6);
  const lonOS=lon0+X*dE-XI*Math.pow(dE,3)+XII*Math.pow(dE,5);
  const H=0;
  const sinLat=Math.sin(latOS),cosLat=Math.cos(latOS);
  const airyA=a,airyB=b;
  let x= (airyA/Math.sqrt(1-e2*sinLat*sinLat)+H)*cosLat*Math.cos(lonOS);
  let y= (airyA/Math.sqrt(1-e2*sinLat*sinLat)+H)*cosLat*Math.sin(lonOS);
  let z= ((airyA*(1-e2))/Math.pow(1-e2*sinLat*sinLat,1.5)+H)*sinLat;
  const tx=446.448,ty=-125.157,tz=542.06,rx=.1502*Math.PI/(180*3600),ry=.2470*Math.PI/(180*3600),rz=.8421*Math.PI/(180*3600),s=-20.4894e-6;
  const x2=tx+(1+s)*x-rz*y+ry*z,y2=ty+rz*x+(1+s)*y-rx*z,z2=tz-ry*x+rx*y+(1+s)*z;
  const wgsA=6378137,wgsB=6356752.3141,wgsE2=1-(wgsB*wgsB)/(wgsA*wgsA);
  const p=Math.sqrt(x2*x2+y2*y2),lon=Math.atan2(y2,x2);
  let latW=Math.atan2(z2,p*(1-wgsE2));
  for(let i=0;i<10;i++){const sinW=Math.sin(latW);latW=Math.atan2(z2+wgsE2*wgsA/Math.sqrt(1-wgsE2*sinW*sinW)*sinW,p)}
  return {lat:latW*180/Math.PI,lon:lon*180/Math.PI};
}

async function resolveGlasgowUPRN(x){
  const address=addressLabel(x),postcode=pc($('#postcode').value);

  // Glasgow's GMS-Address locator returns LOCATOR_ID for each exact property.
  // In this locator that reference is the property's UPRN, so use it directly
  // when it is numeric. This is the important bit: do NOT throw away the exact
  // property identifier and try to rediscover the same house with fuzzy text.
  // The address result may already contain the UPRN in its attributes.
  // Prefer that exact identifier before doing a second locator request.
  const supplied=String(x?.attrs?.UPRN||x?.attrs?.uprn||'').trim();
  if(/^\d{8,20}$/.test(supplied))return supplied;

  const xcoord=Number(x?.x),ycoord=Number(x?.y);
  if(Number.isFinite(xcoord)&&Number.isFinite(ycoord)){
    try{
      const u='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-UPRN/GEOCODESERVICE/GeocodeServer/reverseGeocode?location='+encodeURIComponent(xcoord+','+ycoord)+'&distance=100&f=json';
      const d=JSON.parse(await getText(u));
      const a=d?.address||{};
      const attrs=d?.location||d?.attributes||{};
      const id=String(
        a?.UPRN||a?.uprn||attrs?.UPRN||attrs?.uprn||
        attrs?.LOCATOR_ID||attrs?.Locator_ID||
        d?.LOCATOR_ID||d?.uprn||''
      ).trim();
      if(/^\d{8,20}$/.test(id))return id;
    }catch(e){}
  }

  // Text fallback against Glasgow's dedicated UPRN locator.
  const queries=[
    address+', '+postcode,
    address,
    address.replace(/,\s*Glasgow.*$/i,'')+', '+postcode,
    address.replace(/,\s*Glasgow.*$/i,'')
  ];
  const norm=s=>String(s||'').toUpperCase()
    .replace(/\bST\b/g,'STREET').replace(/\bRD\b/g,'ROAD')
    .replace(/\bAVE\b/g,'AVENUE').replace(/\bCRES\b/g,'CRESCENT')
    .replace(/\bDR\b/g,'DRIVE').replace(/\bLN\b/g,'LANE')
    .replace(/\bGDNS\b/g,'GARDENS').replace(/\bPL\b/g,'PLACE')
    .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const wanted=norm(address),house=(wanted.match(/^\d+/)||[''])[0];

  for(const q of queries){
    try{
      const u='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-UPRN/GEOCODESERVICE/GeocodeServer/findAddressCandidates?SingleLine='+encodeURIComponent(q)+'&f=json&maxLocations=10&outFields=*';
      const d=JSON.parse(await getText(u));
      const rows=Array.isArray(d?.candidates)?d.candidates:[];
      const ranked=rows.map(c=>{
        const ca=norm(c?.address||c?.attributes?.Match_addr||c?.attributes?.LOCATOR_DESCRIPTION||'');
        const id=String(c?.attributes?.UPRN||c?.attributes?.uprn||c?.attributes?.LOCATOR_ID||c?.attributes?.Locator_ID||'').trim();
        const score=(ca===wanted?6:0)+(house&&ca.startsWith(house+' ')?3:0)+(ca.includes(wanted.replace(/^\d+\s*/,''))?2:0)+(Number(c?.score||c?.attributes?.Score||0)>=90?1:0);
        return {id,score};
      }).filter(c=>/^\d{8,20}$/.test(c.id)).sort((a,b)=>b.score-a.score);
      if(ranked.length)return ranked[0].id;
    }catch(e){}
  }

  throw Error('Glasgow could not resolve a UPRN for '+address+'.');
}
async function findWhenIsBinsProperty(postcode,label){
  // The Glasgow address list above is used only to give the user the complete
  // property list. WhenIsBins is the collection-data provider and supplies its
  // own opaque property_id for the selected house. Never turn that ID into a UPRN.
  const firstLine=String(label||'').split(',')[0].trim();
  const d=await getJSON(WB+'/addresses?postcode='+encodeURIComponent(postcode)+'&q='+encodeURIComponent(firstLine));
  const rows=Array.isArray(d?.candidates)?d.candidates:[];
  const want=normAddress(firstLine);
  const exact=rows.find(x=>normAddress(addressLabel(x))===want)
    ||rows.find(x=>normAddress(addressLabel(x)).startsWith(want+' '))
    ||null;
  if(!exact?.id)throw Error('WhenIsBins could not return the collection property ID for '+firstLine+'.');
  return exact;
}

async function selectAddress(x){
  current={postcode:pc($('#postcode').value),property_id:x.id,label:addressLabel(x),council:x.council||null};
  $('#schedule').classList.add('hidden');
  msg('Checking the live collection schedule…');

  try{
    // Glasgow is handled directly by Glasgow City Council's own calendar.
    // This is deliberately NOT routed through WhenIsBins: that service was
    // the source of the HTTP 408 shown in the current build.
    if((current.council?.id||current.council?.gss)==='S12000049'){
      // Glasgow address results are resolved to the exact UPRN and then read
      // directly from Glasgow City Council's official collection calendar.
      // This avoids the WhenIsBins live lookup that was timing out with HTTP 408.
      const uprn=await resolveGlasgowUPRN(x);
      current.property_id=String(uprn);

      const html=await fetchText(
        'https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN='+
        encodeURIComponent(current.property_id)
      );
      const bins=parseGlasgowCalendar(html);
      if(!bins.length)throw Error('Glasgow returned no dated collections for this property.');

      renderSchedule({
        matched_address:current.label,
        council:current.council,
        collections:bins.map(b=>({name:b.name,dates:[b.date]}))
      });
      return;
    }

    // Non-Glasgow councils keep the existing WhenIsBins path.
    let property=x;
    if(current.council?.id){
      property=await findWhenIsBinsProperty(current.postcode,current.label);
      current.property_id=property.id;
    }

    const calendarUrl=String(
      await getText(WB+'/calendar-url?property_id='+encodeURIComponent(property.id))
    ).trim();
    if(!calendarUrl)throw Error('No public collection calendar is available for this property yet.');

    const ics=await fetchText(calendarUrl);
    const bins=parseICS(ics);
    if(!bins.length)throw Error('The live collection calendar returned no dated collections.');

    renderSchedule({
      matched_address:current.label,
      council:current.council,
      collections:bins.map(b=>({name:b.name,dates:[b.date]}))
    });
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
  if(!bins.length && Array.isArray(r?.by_date)){
    for(const d of r.by_date){
      const ds=typeof d==='string'?d:d?.date;
      const names=Array.isArray(d?.collections)?d.collections:[];
      if(ds && names.length)for(const x of names)bins.push({date:ds,name:typeof x==='string'?x:x?.name||x?.waste_type||'Collection'});
      else if(ds)bins.push({date:ds,name:d?.name||d?.waste_type||'Collection'});
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
