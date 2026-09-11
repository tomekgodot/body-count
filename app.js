const DB_NAME='bodycount-db';
const DB_VERSION=1;
const app=document.getElementById('app');
let db;
let state={screen:'home',selectedPersonId:null,selectedEncounterId:null,quick:{rating:0,mode:'new'},detailsTab:'overview',detailsReturn:'postadd'};

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('people')) d.createObjectStore('people',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('encounters')) d.createObjectStore('encounters',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('settings')) d.createObjectStore('settings',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((r,j)=>{const q=store(name).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function get(name,id){return new Promise((r,j)=>{const q=store(name).get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function put(name,value){return new Promise((r,j)=>{const q=store(name,'readwrite').put(value);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function add(name,value){return new Promise((r,j)=>{const q=store(name,'readwrite').add(value);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials=s=>{const t=(s||'?').trim(); return t==='?'?'?':t.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()};
const fmt=d=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(d));
const displayName=p=>p?.name?.trim()||`Mystery #${p?.id}`;
const avgRating=es=>{const r=es.filter(e=>e.rating>0);return r.length?(r.reduce((s,e)=>s+e.rating,0)/r.length).toFixed(1):'—'};

async function render(){
  if(state.screen==='home') return renderHome();
  if(state.screen==='add') return renderAdd();
  if(state.screen==='postadd') return renderPostAdd();
  if(state.screen==='person') return renderPerson();
  if(state.screen==='collection') return renderCollection();
  if(state.screen==='insights') return renderPlaceholder('Insights','Your patterns will live here once there is enough data.','insights');
  if(state.screen==='you') return renderPlaceholder('You','Privacy, health, backup and settings will live here.','you');
  if(state.screen==='details') return renderDetails();
  if(state.screen==='encounter') return renderEncounter();
}
function nav(active='home'){
  return `<nav class="bottom-nav">
    <button class="navbtn ${active==='home'?'active':''}" data-nav="home"><span class="nav-ico">○</span><span>COUNT</span></button>
    <button class="navbtn ${active==='collection'?'active':''}" data-nav="collection"><span class="nav-ico">◫</span><span>PEOPLE</span></button>
    <button class="navbtn ${active==='insights'?'active':''}" data-nav="insights"><span class="nav-ico">⌁</span><span>INSIGHTS</span></button>
    <button class="navbtn ${active==='you'?'active':''}" data-nav="you"><span class="nav-ico">◌</span><span>YOU</span></button>
  </nav>`;
}
function attachNav(){document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.nav;render()})}

async function renderHome(){
  app.innerHTML=`<main class="count-home" aria-label="Body Count home">
    <div class="home-brand">BODY COUNT</div>
    <div class="count-cta-wrap">
      <button class="bc-action bc-action-free" id="addBtn" aria-label="Add someone">
        <span class="free-halo" aria-hidden="true"></span>
        <span class="free-fruit free-peach">🍑</span>
        <span class="free-fruit free-eggplant">🍆</span>
        <span class="bc-plus free-plus" aria-hidden="true">+</span>
      </button>
    </div>
  </main>${nav('home')}`;
  document.getElementById('addBtn').onclick=()=>{
    const btn=document.getElementById('addBtn');
    const home=document.querySelector('.count-home');
    btn.classList.add('pressed');
    home?.classList.add('leaving');
    setTimeout(()=>{state.quick={rating:0,mode:'new'};state.screen='add';render()},360);
  };
  attachNav();
}

function renderPlaceholder(title,copy,active){
  app.innerHTML=`<div class="topbar"><div><h1 class="screen-title" style="margin:0">${title}</h1><p class="sub" style="margin:6px 0 0">${copy}</p></div></div><div class="card empty" style="margin-top:24px">Coming next. For now, Body Count stays focused on one thing: adding and remembering people.</div>${nav(active)}`;
  attachNav();
}

async function renderAdd(){
  const people=(await all('people')).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const mode=state.quick.mode||'new';
  const selected=state.quick.personId?people.find(p=>p.id===state.quick.personId):null;

  app.innerHTML=`<section class="add-screen quick-add screen-enter">
    <div class="quick-add-head">
      <button class="quick-close" id="back" aria-label="Back">×</button>
      <h1>ADD SOMEONE</h1>
      <span aria-hidden="true"></span>
    </div>

    ${mode==='new' ? `
      <div class="quick-field">
        <input class="quick-input" id="name" placeholder="Name / nick" value="${esc(state.quick.name||'')}" autocomplete="off">
      </div>
      <button class="quick-mode-link" id="existingLink">Already in your count?</button>
    ` : `
      <div class="quick-existing-head">
        <span>Who?</span>
        <button class="quick-mode-link" id="newLink">New guy instead</button>
      </div>
      ${people.length ? `<div class="people-picker quick-picker">${people.map(p=>`<button class="pick-person ${selected?.id===p.id?'on':''}" data-pick-person="${p.id}"><b>${esc(displayName(p))}</b><span>${esc(p.lastMemory||`#${String(p.id).padStart(3,'0')}`)}</span></button>`).join('')}</div>` : `<div class="quick-empty">Nobody here yet.</div>`}
    `}

    <div class="quick-field">
      <textarea id="memory" maxlength="60" placeholder="The one thing you’ll remember…">${esc(state.quick.memory||'')}</textarea>
    </div>

    <div class="quick-rating" aria-label="Rating">
      ${[1,2,3,4,5].map(n=>`<button class="star ${state.quick.rating>=n?'on':''}" data-star="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}
    </div>

    <button class="primary quick-save" id="save" ${mode==='existing'&&!selected?'disabled':''}>ADD</button>
  </section>`;

  document.getElementById('back').onclick=()=>{state.screen='home';render()};

  document.getElementById('existingLink')?.addEventListener('click',()=>{
    state.quick={
      rating:state.quick.rating||0,
      name:document.getElementById('name')?.value||'',
      memory:document.getElementById('memory')?.value||'',
      mode:'existing'
    };
    renderAdd();
  });

  document.getElementById('newLink')?.addEventListener('click',()=>{
    state.quick={
      rating:state.quick.rating||0,
      name:state.quick.name||'',
      memory:document.getElementById('memory')?.value||'',
      mode:'new'
    };
    delete state.quick.personId;
    renderAdd();
  });

  document.querySelectorAll('[data-pick-person]').forEach(b=>b.onclick=()=>{
    state.quick.personId=Number(b.dataset.pickPerson);
    state.quick.memory=document.getElementById('memory').value;
    renderAdd();
  });

  document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{
    state.quick.rating=Number(b.dataset.star);
    state.quick.name=document.getElementById('name')?.value||state.quick.name||'';
    state.quick.memory=document.getElementById('memory').value;
    renderAdd();
  });

  document.getElementById('save').onclick=saveQuick;
}
async function saveQuick(){
  const memory=document.getElementById('memory').value.trim();
  const mode=state.quick.mode||'new';
  let personId;
  if(mode==='existing'){
    personId=state.quick.personId;
    if(!personId) return;
  } else {
    const name=(document.getElementById('name')?.value||'').trim();
    personId=await add('people',{name,createdAt:new Date().toISOString(),about:{}});
  }
  const encounterId=await add('encounters',{personId,date:new Date().toISOString(),memory,rating:state.quick.rating||0,position:[],happened:[],health:[],notes:''});
  const p=await get('people',personId);
  if(memory){p.lastMemory=memory;await put('people',p)}
  state.selectedPersonId=personId;state.selectedEncounterId=encounterId;state.lastAddMode=mode;state.detailsReturn='postadd';state.screen='postadd';render();
}

function detailTiles(){return [['position','↕','Position','Top, bottom, vers…'],['happened','✦','What happened','Keep it brief or detailed'],['health','＋','Health','Protection & context'],['about','◌','About him','Age, height, notes'],['anatomy','◇','The details','Private extras']];}
async function renderPostAdd(){
  const p=await get('people',state.selectedPersonId);
  app.innerHTML=`<div class="success"><b>${state.lastAddMode==='existing'?`Another one with ${esc(displayName(p))} ✓`:`${esc(displayName(p))} added ✓`}</b><span>Anything else worth remembering?</span></div>
  <p class="sub">Optional. Pick one, several, or none.</p>
  <div class="option-grid">${detailTiles().map(x=>`<button class="option" data-detail="${x[0]}"><div class="ico">${x[1]}</div><b>${x[2]}</b><span>${x[3]}</span></button>`).join('')}</div><div style="height:18px"></div><button class="primary" id="done">DONE</button>`;
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.detailsTab=b.dataset.detail;state.detailsReturn='postadd';state.screen='details';render()});
  document.getElementById('done').onclick=()=>{state.screen='person';render()};
}

async function renderDetails(){
 const p=await get('people',state.selectedPersonId);
 let e=state.selectedEncounterId?await get('encounters',state.selectedEncounterId):null;
 const tab=state.detailsTab;
 if(!e && ['position','happened','health'].includes(tab)){const es=(await all('encounters')).filter(x=>x.personId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date));e=es[0];state.selectedEncounterId=e?.id||null;}
 let body='';
 if(tab==='position') body=chipEditor('Position',['Top','Bottom','Vers','Side / other'],e?.position||[],'position');
 if(tab==='happened') body=chipEditor('What happened',['Kiss','Oral','Anal','Rimming','Fisting','Other'],e?.happened||[],'happened');
 if(tab==='health') body=chipEditor('Health / protection',['Condom','PrEP','DoxyPEP','No barrier','Other'],e?.health||[],'health');
 if(tab==='about') body=`<div class="field"><label>Age</label><input class="input" id="age" inputmode="numeric" placeholder="Optional" value="${esc(p.about?.age||'')}"></div><div class="field"><label>Height</label><input class="input" id="height" placeholder="e.g. 185 cm" value="${esc(p.about?.height||'')}"></div><div class="field"><label>About him</label><textarea id="aboutnote" placeholder="Anything useful later">${esc(p.about?.note||'')}</textarea></div>`;
 if(tab==='anatomy') body=`<p class="sub">Private details, only if you care. Nothing here is required.</p><div class="tabs"><button class="tab on" data-sub="egg">◇ One</button><button class="tab" data-sub="peach">◐ Two</button><button class="tab" data-sub="drop">◌ Three</button></div><div id="anatomyPanel">${anatomyEgg(p)}</div>`;
 app.innerHTML=`<button class="linkbtn" id="back">← Back</button><h1 class="screen-title">${tab==='anatomy'?'The details':tab[0].toUpperCase()+tab.slice(1)}</h1>${body}<div style="height:16px"></div><button class="primary" id="save">SAVE</button><p class="small" style="text-align:center">🔒 On this device only</p>`;
 document.getElementById('back').onclick=()=>{state.screen=state.detailsReturn||'person';render()};
 if(tab==='anatomy') document.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-sub]').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById('anatomyPanel').innerHTML=b.dataset.sub==='egg'?anatomyEgg(p):b.dataset.sub==='peach'?anatomyPeach(p):anatomyDrop(p);attachAnatomyHandlers()});
 if(['position','happened','health'].includes(tab)) attachChipHandlers();
 attachAnatomyHandlers();
 document.getElementById('save').onclick=()=>saveDetails(tab,e);
}
function chipEditor(title,items,selected,key){return `<p class="sub">Choose what matters. Leave the rest blank.</p><div class="chips">${items.map(x=>`<button class="chip ${selected.includes(x)?'on':''}" data-chip="${esc(x)}" data-key="${key}">${esc(x)}</button>`).join('')}</div>`}
function attachChipHandlers(){document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>b.classList.toggle('on'))}
function anatomyEgg(p){const a=p.anatomy?.egg||{};return `<div class="field"><label>Length</label><input class="input" id="eggLength" inputmode="decimal" placeholder="e.g. 17 cm" value="${esc(a.length||'')}"></div><div class="field"><label>Girth</label><input class="input" id="eggGirth" inputmode="decimal" placeholder="e.g. 13 cm" value="${esc(a.girth||'')}"></div><div class="field"><label>Cut?</label><div class="chips">${['Yes','No','?'].map(x=>`<button class="chip ${a.cut===x?'on':''}" data-single="eggCut" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Curve / shape</label><div class="chips">${['Straight','Up','Down','Left / right'].map(x=>`<button class="chip ${a.curve===x?'on':''}" data-single="eggCurve" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Veins</label><div class="chips">${['None','Subtle','Visible','Very'].map(x=>`<button class="chip ${a.veins===x?'on':''}" data-single="eggVeins" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('eggRating',a.rating||0)}`}
function anatomyPeach(p){const a=p.anatomy?.peach||{};return `<div class="field"><label>Size</label><div class="chips">${['Small','Medium','Large'].map(x=>`<button class="chip ${a.size===x?'on':''}" data-single="peachSize" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Shape</label><div class="chips">${['Flat','Round','Bubble','Wide'].map(x=>`<button class="chip ${a.shape===x?'on':''}" data-single="peachShape" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Firmness</label><div class="chips">${['Soft','Medium','Firm'].map(x=>`<button class="chip ${a.firmness===x?'on':''}" data-single="peachFirm" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Hair</label><div class="chips">${['Smooth','Some','Natural'].map(x=>`<button class="chip ${a.hair===x?'on':''}" data-single="peachHair" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('peachRating',a.rating||0)}`}
function anatomyDrop(p){const a=p.anatomy?.drop||{};return `<div class="field"><label>Amount</label><div class="chips">${['Low','Medium','High'].map(x=>`<button class="chip ${a.amount===x?'on':''}" data-single="dropAmount" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Distance</label><div class="chips">${['Short','Medium','Far'].map(x=>`<button class="chip ${a.distance===x?'on':''}" data-single="dropDistance" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('dropRating',a.rating||0)}`}
function ratingEditor(key,val){return `<div class="field"><label>Overall</label><div class="stars">${[1,2,3,4,5].map(n=>`<button class="star ${val>=n?'on':''}" data-ratekey="${key}" data-rate="${n}">★</button>`).join('')}</div></div>`}
function attachAnatomyHandlers(){document.querySelectorAll('[data-single]').forEach(b=>b.onclick=()=>{document.querySelectorAll(`[data-single="${b.dataset.single}"]`).forEach(x=>x.classList.remove('on'));b.classList.add('on')});document.querySelectorAll('[data-ratekey]').forEach(b=>b.onclick=()=>{const key=b.dataset.ratekey,n=Number(b.dataset.rate);document.querySelectorAll(`[data-ratekey="${key}"]`).forEach(x=>x.classList.toggle('on',Number(x.dataset.rate)<=n))})}
async function saveDetails(tab,e){
 let p=await get('people',state.selectedPersonId);
 if(['position','happened','health'].includes(tab)&&e){e[tab]=[...document.querySelectorAll('[data-chip].on')].map(x=>x.dataset.chip);await put('encounters',e)}
 if(tab==='about'){p.about={...(p.about||{}),age:document.getElementById('age').value,height:document.getElementById('height').value,note:document.getElementById('aboutnote').value};await put('people',p)}
 if(tab==='anatomy'){
   p.anatomy=p.anatomy||{};
   if(document.getElementById('eggLength')) p.anatomy.egg={length:document.getElementById('eggLength').value,girth:document.getElementById('eggGirth').value,cut:selected('eggCut'),curve:selected('eggCurve'),veins:selected('eggVeins'),rating:rating('eggRating')};
   else if(document.querySelector('[data-single="peachSize"]')) p.anatomy.peach={size:selected('peachSize'),shape:selected('peachShape'),firmness:selected('peachFirm'),hair:selected('peachHair'),rating:rating('peachRating')};
   else p.anatomy.drop={amount:selected('dropAmount'),distance:selected('dropDistance'),rating:rating('dropRating')};
   await put('people',p);
 }
 state.screen=state.detailsReturn||'person';render();
}
const selected=k=>document.querySelector(`[data-single="${k}"].on`)?.dataset.value||'';
const rating=k=>Math.max(0,...[...document.querySelectorAll(`[data-ratekey="${k}"].on`)].map(x=>Number(x.dataset.rate)));

function profileSummary(p){const bits=[];if(p.about?.age)bits.push(`${esc(p.about.age)} yrs`);if(p.about?.height)bits.push(esc(p.about.height));return bits.join(' · ')}
async function renderPerson(){
 const p=await get('people',state.selectedPersonId);
 const encounters=(await all('encounters')).filter(e=>e.personId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
 const avg=avgRating(encounters); const latest=encounters[0];
 app.innerHTML=`<button class="linkbtn" id="back">← Collection</button>
 <section class="profile-hero"><div class="profile-avatar">${esc(initials(p.name))}</div><div class="profile-copy"><div class="eyebrow">#${String(p.id).padStart(3,'0')}</div><h1>${esc(displayName(p))}</h1><p>${esc(p.lastMemory||latest?.memory||'No mental note yet')}</p><div class="profile-badges"><span>${encounters.length}× met</span><span>${avg==='—'?'Not rated':`★ ${avg}`}</span>${profileSummary(p)?`<span>${profileSummary(p)}</span>`:''}</div></div></section>
 <div class="section-title"><h2>Remember more</h2><span>optional</span></div><div class="option-grid compact">${detailTiles().map(x=>`<button class="option" data-profile-detail="${x[0]}"><div class="ico">${x[1]}</div><b>${x[2]}</b><span>${x[3]}</span></button>`).join('')}</div>
 <div class="section-title"><h2>History</h2><span>${encounters.length} ${encounters.length===1?'time':'times'}</span></div>
 ${encounters.length?encounters.map((e,i)=>`<button class="card encounter-card" data-encounter="${e.id}"><div><b>${i===0?'Latest · ':''}${fmt(e.date)}</b><p>${esc(e.memory||'No mental note')}</p></div><div class="encounter-rating">${e.rating?`★ ${e.rating}`:'—'}</div></button>`).join(''):`<div class="card empty">No history yet.</div>`}
 <div style="height:12px"></div><button class="primary" id="again">＋ ADD ANOTHER TIME</button>${nav('collection')}`;
 document.getElementById('back').onclick=()=>{state.screen='collection';render()};
 document.getElementById('again').onclick=()=>{state.quick={rating:0,mode:'existing',personId:p.id};state.screen='add';render()};
 document.querySelectorAll('[data-profile-detail]').forEach(b=>b.onclick=()=>{state.detailsTab=b.dataset.profileDetail;state.selectedEncounterId=latest?.id||null;state.detailsReturn='person';state.screen='details';render()});
 document.querySelectorAll('[data-encounter]').forEach(b=>b.onclick=()=>{state.selectedEncounterId=Number(b.dataset.encounter);state.screen='encounter';render()});attachNav();
}

async function renderEncounter(){
 const e=await get('encounters',state.selectedEncounterId); const p=await get('people',e.personId); state.selectedPersonId=p.id;
 const chips=(label,arr)=>arr?.length?`<div class="encounter-section"><span>${label}</span><div class="chips readonly">${arr.map(x=>`<span class="chip on">${esc(x)}</span>`).join('')}</div></div>`:'';
 app.innerHTML=`<button class="linkbtn" id="back">← ${esc(displayName(p))}</button><div class="encounter-head"><div class="eyebrow">ENCOUNTER</div><h1>${fmt(e.date)}</h1><div class="big-rating">${e.rating?`★ ${e.rating}`:'Not rated'}</div></div>
 <div class="card"><div class="eyebrow">MENTAL NOTE</div><p class="encounter-note">${esc(e.memory||'Nothing written down.')}</p>${chips('POSITION',e.position)}${chips('WHAT HAPPENED',e.happened)}${chips('HEALTH',e.health)}</div>
 <div class="section-title"><h2>Add / edit</h2><span>this encounter</span></div><div class="encounter-actions"><button class="secondary" data-edit="position">Position</button><button class="secondary" data-edit="happened">What happened</button><button class="secondary" data-edit="health">Health</button></div>
 <p class="small" style="text-align:center;margin-top:16px">🔒 Stored on this device</p>`;
 document.getElementById('back').onclick=()=>{state.screen='person';render()};
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{state.detailsTab=b.dataset.edit;state.detailsReturn='encounter';state.screen='details';render()});
}

async function renderCollection(){
 const people=await all('people');const encounters=await all('encounters');
 const rows=people.map(p=>{const es=encounters.filter(e=>e.personId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date));return {p,es,last:es[0]}}).sort((a,b)=>new Date(b.last?.date||b.p.createdAt||0)-new Date(a.last?.date||a.p.createdAt||0));
 app.innerHTML=`<div class="topbar"><div><h1 class="screen-title" style="margin:0">The Collection</h1><p class="sub" style="margin:5px 0 0">${people.length} ${people.length===1?'guy':'guys'}</p></div><div class="privacy-pill">🔒 Local</div></div>
 <div class="search-wrap"><input class="input" id="search" placeholder="Find by name or mental note…"></div><div id="collectionList">
 ${collectionMarkup(rows)}</div>${nav('collection')}`;
 const search=document.getElementById('search'); search.oninput=()=>{const q=search.value.trim().toLowerCase();const filtered=!q?rows:rows.filter(({p})=>`${p.name||''} ${p.lastMemory||''}`.toLowerCase().includes(q));document.getElementById('collectionList').innerHTML=collectionMarkup(filtered);attachCollectionRows()};
 attachCollectionRows();attachNav();
}
function collectionMarkup(rows){return rows.length?rows.map(({p,es,last})=>`<button class="card person-card" style="width:100%;text-align:left" data-person="${p.id}"><div class="avatar">${esc(initials(p.name))}</div><div class="person-main"><h3>${esc(displayName(p))}</h3><p>${esc(p.lastMemory||last?.memory||`#${String(p.id).padStart(3,'0')}`)}</p></div><div class="person-meta"><b>${es.length}×</b><span>${avgRating(es)==='—'?'':`★ ${avgRating(es)}`}</span></div></button>`).join(''):`<div class="card empty">Nobody matching that.</div>`}
function attachCollectionRows(){document.querySelectorAll('[data-person]').forEach(x=>x.onclick=()=>{state.selectedPersonId=Number(x.dataset.person);state.screen='person';render()})}

(async()=>{db=await openDB();render();if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{})})();
