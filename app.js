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
    const id=String(c?.attributes?.LOCATOR_ID||c?.attributes?.Locator_ID||c?.attributes?.LOCATOR_DESCRIPTION||'').trim();
    if(!label||!id||seen.has(label))continue;
    seen.add(label);
    out.push({id,label,postcode,council:{id:'S12000049',name:'Glasgow City Council'}});
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
    const r=await fetch(url,{headers:{Accept:'text/plain,text/calendar,application/json'},signal:ctl.signal});
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

async function selectAddress(x){
  current={postcode:pc($('#postcode').value),property_id:x.id,label:addressLabel(x),council:x.council||null};
  $('#schedule').classList.add('hidden');
  msg('Checking the live collection schedule…');

  try{
    if((current.council?.id||current.council?.gss)==='S12000049'){
      const house=(current.label.match(/^\s*(\d+[A-Z]?)\b/i)||[])[1]||'';
      if(!house)throw Error('The selected Glasgow address has no house number.');

      // The Glasgow gazetteer supplies the complete address list. Resolve
      // the selected house through WhenIsBins to obtain its opaque property_id.
      const d=await getJSON(WB+'/addresses?postcode='+encodeURIComponent(current.postcode)+'&q='+encodeURIComponent(house));
      const candidates=Array.isArray(d?.candidates)?d.candidates:[];
      const wanted=normAddress(current.label);
      const exact=candidates.find(v=>normAddress(addressLabel(v))===wanted)||
                  candidates.find(v=>{
                    const n=normAddress(addressLabel(v));
                    return n.startsWith(normAddress(house)+' ');
                  });
      if(!exact?.id)throw Error('WhenIsBins could not identify that exact Glasgow property.');

      // Glasgow City Council publishes the live calendar directly from the
      // property's UPRN. Resolve the selected address against the council
      // gazetteer, then read the official calendar. This avoids relying on a
      // stale/abbreviated third-party property lookup.
      try{
        const g='https://www.mapping.glasgow.gov.uk/locatorhub/arcgis/rest/services/GMS-UPRN/GEOCODESERVICE/GeocodeServer/findAddressCandidates?SingleLine='+encodeURIComponent(current.label+', '+current.postcode)+'&f=json&maxLocations=10&outFields=*';
        const gd=JSON.parse(await getText(g));
        const wanted=normAddress(current.label);
        const house=(wanted.match(/^\d+/)||[''])[0];
        const cs=Array.isArray(gd?.candidates)?gd.candidates:[];
        const ranked=cs.map(v=>{
          const a=normAddress(v.address||v.attributes?.Match_addr||'');
          const uprn=String(v.attributes?.UPRN||v.attributes?.uprn||v.attributes?.LOCATOR_ID||v.attributes?.Locator_ID||v.attributes?.LOCATOR_DESCRIPTION||'').trim();
          let score=0;
          if(uprn)score+=1;
          if(house&&a.startsWith(house+' '))score+=2;
          if(a===wanted)score+=5;
          else if(a.includes(wanted))score+=2;
          return {v,a,uprn,score};
        }).filter(v=>v.uprn).sort((a,b)=>b.score-a.score);

        const best=ranked[0];
        if(!best || best.score<3)throw Error('Glasgow could not match that exact property to a UPRN.');

        const cal='https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN='+encodeURIComponent(best.uprn);
        const html=await getText(cal);
        const plain=html
          .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
          .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
          .replace(/<[^>]+>/g,' ')
          .replace(/&nbsp;/gi,' ')
          .replace(/&amp;/gi,'&')
          .replace(/\\s+/g,' ')
          .trim();

        const found=[];
        const re=/Your next ([A-Za-z &]+?) day is (Tomorrow|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s+\\d{1,2}(?:st|nd|rd|th)\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4})/gi;
        let m;
        while((m=re.exec(plain))){
          let ds=m[2];
          if(/^Tomorrow$/i.test(ds)){
            const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+1);
            ds=d.toISOString().slice(0,10);
          }else{
            const mm=ds.match(/\\b(\\d{1,2})\\w+\\s+(\\w+)\\s+(\\d{4})/);
            if(mm){
              const months={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
              const d=new Date(Number(mm[3]),months[mm[2].toLowerCase()],Number(mm[1]),12);
              if(!Number.isNaN(d.getTime()))ds=d.toISOString().slice(0,10);
            }
          }
          found.push({date:ds,name:m[1].trim()+' Bin'});
        }
        const unique=[...new Map(found.map(x=>[x.name+'|'+x.date,x])).values()]
          .filter(x=>x.date)
          .sort((a,b)=>a.date.localeCompare(b.date));

        if(unique.length){
          return renderSchedule({
            matched_address:best.v.address||best.v.attributes?.Match_addr||current.label,
            council:{name:'Glasgow City Council'},
            collections:unique.map(x=>({name:x.name,dates:[{date:x.date}]}))
          });
        }
        throw Error('Glasgow returned no dated collections for this property.');
      }catch(glErr){
        // Fall back to the existing live lookup service. Do not invent a date.
        const key=crypto.randomUUID();
        let state=await getJSON(WB+'/lookups',{
          method:'POST',
          headers:{'Content-Type':'application/json','Idempotency-Key':key},
          body:JSON.stringify({postcode:current.postcode,property_id:exact.id})
        });
        const lookupId=String(state?.id||state?.lookup_id||'');
        if(!lookupId)throw Error(glErr.message||state?.detail||'The live collection lookup did not return an ID.');

        for(let i=0;i<18;i++){
          const status=String(state?.status||'').toLowerCase();
          if(status==='done')return renderSchedule(state.result||state.schedule||state);
          if(status==='partial' && state?.result)return renderSchedule(state.result);
          if(status==='failed')throw Error(state?.detail||state?.problem||glErr.message||'The council lookup failed.');
          const wait=Math.min(12,Math.max(3,Number(state?.retry_after_seconds||state?.retryAfterSeconds||5)));
          await new Promise(r=>setTimeout(r,wait*1000));
          state=await getJSON(WB+'/lookups/'+encodeURIComponent(lookupId));
        }
        throw Error(glErr.message||'The council lookup is taking longer than usual. Please try again shortly.');
      }
    }

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
      if(s==='partial'&&state?.result)return renderSchedule(state.result);
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
