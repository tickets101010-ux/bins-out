(() => {
  const KEY='binsout_v2_saved';
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
  function write(a){localStorage.setItem(KEY,JSON.stringify(a.slice(0,20)))}
  function uniqueRef(a,i){
    const used=new Set(a.map(x=>String(x.ref||'').toLowerCase()));
    let n=i===0?'Home':'Home '+(i+1);
    if(!used.has(n.toLowerCase()))return n;
    let k=2;while(used.has('Home '+k))k++;return 'Home '+k;
  }
  function migrate(){
    const a=read();let changed=false;
    a.forEach((x,i)=>{if(!x.ref){x.ref=uniqueRef(a,i);changed=true}});
    if(changed)write(a);return a;
  }
  function draw(){
    const a=migrate(),box=$('#savedList'),section=$('#saved');
    if(!a.length){section.classList.add('hidden');return}
    section.classList.remove('hidden');
    box.innerHTML=a.map((x,i)=>`
      <div class="savedCard">
        <div class="savedBadge">${esc(x.ref||('Home '+(i+1)))}</div>
        <div class="savedInfo"><strong>${esc(x.label||'Saved address')}</strong><small>${esc(x.postcode||'')}</small></div>
        <div class="savedActions">
          <button class="ghost small" data-view="${i}">View</button>
          <button class="ghost small" data-rename="${i}">Rename</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>window.selectAddress&&window.selectAddress(a[+b.dataset.view]));
    box.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const i=+b.dataset.rename,x=a[i],name=prompt('Name this saved address:',x.ref||'Home');
      if(name&&name.trim()){x.ref=name.trim();write(a);draw()}
    });
  }
  function installNav(){
    document.querySelectorAll('.quickNav button').forEach(b=>b.onclick=()=>{
      const el=$('#'+b.dataset.target);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  function saveCurrent(){
    if(!window.current)return;
    const a=read(),existing=a.findIndex(x=>x.property_id===window.current.property_id);
    const old=existing>=0?a[existing]:null;
    const item={...window.current,ref:old?.ref||uniqueRef(a,a.length)};
    if(existing>=0)a.splice(existing,1);
    a.unshift(item);write(a);draw();
    const btn=$('#save');if(btn)btn.textContent='Saved ✓';
  }
  function decorateSchedule(){
    const up=$('#upcoming');if(!up)return;
    const rows=[...up.querySelectorAll('.savedRow')];
    if(!rows.length)return;
    up.innerHTML='<h3>Upcoming collections</h3>'+rows.map(r=>{
      const name=r.querySelector('b')?.textContent||'Collection',d=r.querySelector('small')?.textContent||'';
      return '<div class="eventRow"><div class="eventDate">'+esc(d)+'</div><div><div class="eventName">'+esc(name)+'</div><div class="eventCouncil">'+esc($('#council')?.textContent||'')+'</div></div></div>';
    }).join('');
  }
  document.addEventListener('DOMContentLoaded',()=>{
    installNav();migrate();draw();
    const save=$('#save');if(save)save.onclick=saveCurrent;
    const target=$('#schedule')||document.body;
    new MutationObserver(()=>decorateSchedule()).observe(target,{subtree:true,childList:true});
  });
})();