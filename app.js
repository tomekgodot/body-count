const DB_NAME='bodycount-db';
const DB_VERSION=1;
const app=document.getElementById('app');
let db;
let state={screen:'home',selectedPersonId:null,selectedEncounterId:null,quick:{rating:0},detailsTab:'overview'};

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

async function render(){
  if(state.screen==='home') return renderHome();
  if(state.screen==='add') return renderAdd();
  if(state.screen==='postadd') return renderPostAdd();
  if(state.screen==='person') return renderPerson();
  if(state.screen==='collection') return renderCollection();
  if(state.screen==='details') return renderDetails();
}
function nav(active='home'){
  return `<nav class="bottom-nav">
    <button class="navbtn ${active==='home'?'active':''}" data-nav="home">Home</button>
    <button class="navbtn ${active==='collection'?'active':''}" data-nav="collection">Collection</button>
    <button class="navbtn" data-nav="add">＋ Add</button>
    <button class="navbtn ${active==='privacy'?'active':''}" data-nav="privacy">🔒 Local</button>
  </nav>`;
}
function attachNav(){document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{const n=b.dataset.nav;if(n==='privacy'){alert('Your Body Count data is stored in this browser on this device. No account and no backend are used in this prototype.');return;}state.screen=n;render()})}

async function renderHome(){
  const people=await all('people'), encounters=await all('encounters');
  const sorted=[...encounters].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const unique=people.length, repeats=Math.max(0,encounters.length-unique);
  const ratings=encounters.filter(e=>e.rating>0); const avg=ratings.length?(ratings.reduce((s,e)=>s+e.rating,0)/ratings.length).toFixed(1):'—';
  const recent=[]; for(const e of sorted.slice(0,5)){const p=await get('people',e.personId);recent.push({e,p})}
  app.innerHTML=`<div class="topbar"><div class="brand">BODY<br>COUNT</div><div class="privacy-pill">🔒 On this device</div></div>
  <section class="hero"><div class="count">${unique}</div><div class="label">guys in your count</div><div class="stats"><div class="stat"><b>${encounters.length}</b><span>encounters</span></div><div class="stat"><b>${repeats}</b><span>repeats</span></div><div class="stat"><b>${avg}</b><span>avg rating</span></div></div></section>
  <div style="height:14px"></div><button class="primary accent" id="addBtn">＋ ADD TO THE COUNT</button>
  <div class="section-title"><h2>Latest additions</h2><span>${sorted.length?'Tap to open':''}</span></div>
  ${recent.length?recent.map(({e,p})=>`<button class="card person-card" style="width:100%;text-align:left" data-person="${p.id}"><div class="avatar">${esc(initials(p.name))}</div><div class="person-main"><h3>${esc(p.name||`Mystery #${p.id}`)}</h3><p>${esc(e.memory||'No note')} · ${fmt(e.date)}</p></div><div class="rating">${e.rating?`★ ${e.rating}`:'—'}</div></button>`).join(''):`<div class="card empty">Your count is empty. Suspiciously innocent.</div>`}
  ${nav('home')}`;
  document.getElementById('addBtn').onclick=()=>{state.quick={rating:0};state.screen='add';render()};
  document.querySelectorAll('[data-person]').forEach(x=>x.onclick=()=>{state.selectedPersonId=Number(x.dataset.person);state.screen='person';render()});attachNav();
}

function renderAdd(){
  app.innerHTML=`<button class="linkbtn" id="back">← Back</button><h1 class="screen-title">Add to the count</h1><p class="sub">Three things. All optional. Done in seconds.</p>
  <div class="field"><label>Name / nickname</label><input class="input" id="name" placeholder="Alex, gym guy, ???" value="${esc(state.quick.name||'')}"></div>
  <div class="field"><label>Mental note</label><textarea id="memory" maxlength="60" placeholder="The one thing you’ll remember…">${esc(state.quick.memory||'')}</textarea></div>
  <div class="field"><label>Rating</label><div class="stars">${[1,2,3,4,5].map(n=>`<button class="star ${state.quick.rating>=n?'on':''}" data-star="${n}">★</button>`).join('')}</div><div class="small" style="margin-top:7px">Tap again later if you change your mind.</div></div>
  <button class="primary" id="save">ADD TO THE COUNT</button>
  <p class="small" style="text-align:center;margin-top:13px">🔒 Stored locally on this device</p>`;
  document.getElementById('back').onclick=()=>{state.screen='home';render()};
  document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{state.quick.rating=Number(b.dataset.star);state.quick.name=document.getElementById('name').value;state.quick.memory=document.getElementById('memory').value;renderAdd()});
  document.getElementById('save').onclick=saveQuick;
}
async function saveQuick(){
  const name=document.getElementById('name').value.trim(); const memory=document.getElementById('memory').value.trim();
  let personId;
  if(name){
    const people=await all('people');const existing=people.find(p=>p.name?.toLowerCase()===name.toLowerCase());
    personId=existing?.id;
  }
  if(!personId) personId=await add('people',{name,createdAt:new Date().toISOString(),about:{}});
  const encounterId=await add('encounters',{personId,date:new Date().toISOString(),memory,rating:state.quick.rating||0,position:[],happened:[],health:[],notes:''});
  state.selectedPersonId=personId;state.selectedEncounterId=encounterId;state.screen='postadd';render();
}

async function renderPostAdd(){
  const p=await get('people',state.selectedPersonId);
  app.innerHTML=`<div class="success"><b>${esc(p.name||`Mystery #${p.id}`)} added ✓</b><span>Anything worth remembering?</span></div>
  <p class="sub">Optional. Pick one, several, or none.</p>
  <div class="option-grid">
  ${[['position','↕','Position','Top, bottom, vers…'],['happened','✦','What happened','Keep it brief or detailed'],['health','＋','Health','Protection & context'],['about','◌','About him','Age, height, photo later'],['anatomy','◇','The details','🍆 · 🍑 · 💦']].map(x=>`<button class="option" data-detail="${x[0]}"><div class="ico">${x[1]}</div><b>${x[2]}</b><span>${x[3]}</span></button>`).join('')}
  </div><div style="height:18px"></div><button class="primary" id="done">DONE</button>`;
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.detailsTab=b.dataset.detail;state.screen='details';render()});
  document.getElementById('done').onclick=()=>{state.screen='person';render()};
}

async function renderDetails(){
 const e=await get('encounters',state.selectedEncounterId); const p=await get('people',state.selectedPersonId); const tab=state.detailsTab;
 let body='';
 if(tab==='position') body=chipEditor('Position',['Top','Bottom','Vers','Side / other'],e.position||[],'position');
 if(tab==='happened') body=chipEditor('What happened',['Kiss','Oral','Anal','Rimming','Fisting','Other'],e.happened||[],'happened');
 if(tab==='health') body=chipEditor('Health / protection',['Condom','PrEP','DoxyPEP','No barrier','Other'],e.health||[],'health');
 if(tab==='about') body=`<div class="field"><label>Age</label><input class="input" id="age" inputmode="numeric" placeholder="Optional" value="${esc(p.about?.age||'')}"></div><div class="field"><label>Height</label><input class="input" id="height" placeholder="e.g. 185 cm" value="${esc(p.about?.height||'')}"></div><div class="field"><label>About him</label><textarea id="aboutnote" placeholder="Anything useful later">${esc(p.about?.note||'')}</textarea></div>`;
 if(tab==='anatomy') body=`<p class="sub">Private details, only if you care. Nothing here is required.</p>
 <div class="tabs"><button class="tab on" data-sub="egg">◇ 🍆</button><button class="tab" data-sub="peach">◐ 🍑</button><button class="tab" data-sub="drop">◌ 💦</button></div>
 <div id="anatomyPanel">${anatomyEgg(p)}</div>`;
 app.innerHTML=`<button class="linkbtn" id="back">← Back</button><h1 class="screen-title">${tab==='anatomy'?'The details':tab[0].toUpperCase()+tab.slice(1)}</h1>${body}<div style="height:16px"></div><button class="primary" id="save">SAVE</button><p class="small" style="text-align:center">🔒 On this device only</p>`;
 document.getElementById('back').onclick=()=>{state.screen='postadd';render()};
 if(tab==='anatomy') document.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-sub]').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById('anatomyPanel').innerHTML=b.dataset.sub==='egg'?anatomyEgg(p):b.dataset.sub==='peach'?anatomyPeach(p):anatomyDrop(p);attachAnatomyHandlers();});
 if(['position','happened','health'].includes(tab)) attachChipHandlers();
 attachAnatomyHandlers();
 document.getElementById('save').onclick=()=>saveDetails(tab);
}
function chipEditor(title,items,selected,key){return `<p class="sub">Choose what matters. Leave the rest blank.</p><div class="chips">${items.map(x=>`<button class="chip ${selected.includes(x)?'on':''}" data-chip="${esc(x)}" data-key="${key}">${esc(x)}</button>`).join('')}</div>`}
function attachChipHandlers(){document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>b.classList.toggle('on'))}
function anatomyEgg(p){const a=p.anatomy?.egg||{};return `<div class="field"><label>Length</label><input class="input" id="eggLength" inputmode="decimal" placeholder="e.g. 17 cm" value="${esc(a.length||'')}"></div><div class="field"><label>Girth</label><input class="input" id="eggGirth" inputmode="decimal" placeholder="e.g. 13 cm" value="${esc(a.girth||'')}"></div><div class="field"><label>Cut?</label><div class="chips">${['Yes','No','?'].map(x=>`<button class="chip ${a.cut===x?'on':''}" data-single="eggCut" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Curve / shape</label><div class="chips">${['Straight','Up','Down','Left / right'].map(x=>`<button class="chip ${a.curve===x?'on':''}" data-single="eggCurve" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Veins</label><div class="chips">${['None','Subtle','Visible','Very'].map(x=>`<button class="chip ${a.veins===x?'on':''}" data-single="eggVeins" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('eggRating',a.rating||0)}`}
function anatomyPeach(p){const a=p.anatomy?.peach||{};return `<div class="field"><label>Size</label><div class="chips">${['Small','Medium','Large'].map(x=>`<button class="chip ${a.size===x?'on':''}" data-single="peachSize" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Shape</label><div class="chips">${['Flat','Round','Bubble','Wide'].map(x=>`<button class="chip ${a.shape===x?'on':''}" data-single="peachShape" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Firmness</label><div class="chips">${['Soft','Medium','Firm'].map(x=>`<button class="chip ${a.firmness===x?'on':''}" data-single="peachFirm" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Hair</label><div class="chips">${['Smooth','Some','Natural'].map(x=>`<button class="chip ${a.hair===x?'on':''}" data-single="peachHair" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('peachRating',a.rating||0)}`}
function anatomyDrop(p){const a=p.anatomy?.drop||{};return `<div class="field"><label>Amount</label><div class="chips">${['Low','Medium','High'].map(x=>`<button class="chip ${a.amount===x?'on':''}" data-single="dropAmount" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field"><label>Distance</label><div class="chips">${['Short','Medium','Far'].map(x=>`<button class="chip ${a.distance===x?'on':''}" data-single="dropDistance" data-value="${x}">${x}</button>`).join('')}</div></div>${ratingEditor('dropRating',a.rating||0)}`}
function ratingEditor(key,val){return `<div class="field"><label>Overall</label><div class="stars">${[1,2,3,4,5].map(n=>`<button class="star ${val>=n?'on':''}" data-ratekey="${key}" data-rate="${n}">★</button>`).join('')}</div></div>`}
function attachAnatomyHandlers(){document.querySelectorAll('[data-single]').forEach(b=>b.onclick=()=>{document.querySelectorAll(`[data-single="${b.dataset.single}"]`).forEach(x=>x.classList.remove('on'));b.classList.add('on')});document.querySelectorAll('[data-ratekey]').forEach(b=>b.onclick=()=>{const key=b.dataset.ratekey,n=Number(b.dataset.rate);document.querySelectorAll(`[data-ratekey="${key}"]`).forEach(x=>x.classList.toggle('on',Number(x.dataset.rate)<=n))})}
async function saveDetails(tab){
 let e=await get('encounters',state.selectedEncounterId),p=await get('people',state.selectedPersonId);
 if(['position','happened','health'].includes(tab)){e[tab]=[...document.querySelectorAll('[data-chip].on')].map(x=>x.dataset.chip);await put('encounters',e)}
 if(tab==='about'){p.about={...(p.about||{}),age:document.getElementById('age').value,height:document.getElementById('height').value,note:document.getElementById('aboutnote').value};await put('people',p)}
 if(tab==='anatomy'){
   p.anatomy=p.anatomy||{}; const visible=[...document.querySelectorAll('#anatomyPanel [id], #anatomyPanel [data-single].on, #anatomyPanel [data-ratekey].on')];
   if(document.getElementById('eggLength')) p.anatomy.egg={length:document.getElementById('eggLength').value,girth:document.getElementById('eggGirth').value,cut:selected('eggCut'),curve:selected('eggCurve'),veins:selected('eggVeins'),rating:rating('eggRating')};
   else if(document.querySelector('[data-single="peachSize"]')) p.anatomy.peach={size:selected('peachSize'),shape:selected('peachShape'),firmness:selected('peachFirm'),hair:selected('peachHair'),rating:rating('peachRating')};
   else p.anatomy.drop={amount:selected('dropAmount'),distance:selected('dropDistance'),rating:rating('dropRating')};
   await put('people',p);
 }
 state.screen='postadd';render();
}
const selected=k=>document.querySelector(`[data-single="${k}"].on`)?.dataset.value||'';
const rating=k=>Math.max(0,...[...document.querySelectorAll(`[data-ratekey="${k}"].on`)].map(x=>Number(x.dataset.rate)));

async function renderPerson(){
 const p=await get('people',state.selectedPersonId); const encounters=(await all('encounters')).filter(e=>e.personId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date));const ratings=encounters.filter(e=>e.rating);const avg=ratings.length?(ratings.reduce((s,e)=>s+e.rating,0)/ratings.length).toFixed(1):'—';
 app.innerHTML=`<button class="linkbtn" id="back">← Back</button><div class="card" style="margin-top:14px"><div style="display:flex;align-items:center;gap:14px"><div class="avatar" style="width:72px;height:72px;font-size:24px">${esc(initials(p.name))}</div><div><h1 style="margin:0">${esc(p.name||`Mystery #${p.id}`)}</h1><div class="small">#${String(p.id).padStart(3,'0')} · ${encounters.length} encounter${encounters.length===1?'':'s'} · ★ ${avg}</div></div></div>${p.about?.note?`<p>${esc(p.about.note)}</p>`:''}</div>
 <div class="section-title"><h2>History</h2><span>local only</span></div>${encounters.map(e=>`<div class="card" style="margin-bottom:10px"><b>${fmt(e.date)}</b><div class="small" style="margin-top:5px">${esc(e.memory||'No note')} ${e.rating?`· ★ ${e.rating}`:''}</div></div>`).join('')}
 <div style="height:12px"></div><button class="primary" id="again">＋ ADD ANOTHER ENCOUNTER</button>${nav('collection')}`;
 document.getElementById('back').onclick=()=>{state.screen='collection';render()};document.getElementById('again').onclick=()=>{state.quick={name:p.name,rating:0};state.screen='add';render()};attachNav();
}
async function renderCollection(){
 const people=await all('people');const encounters=await all('encounters');
 app.innerHTML=`<div class="topbar"><div><h1 class="screen-title" style="margin:0">The Collection</h1><p class="sub" style="margin:5px 0 0">${people.length} ${people.length===1?'guy':'guys'}</p></div><div class="privacy-pill">🔒 Local</div></div>
 ${people.length?people.map(p=>{const es=encounters.filter(e=>e.personId===p.id);const rr=es.filter(e=>e.rating);const avg=rr.length?(rr.reduce((s,e)=>s+e.rating,0)/rr.length).toFixed(1):'—';return `<button class="card person-card" style="width:100%;text-align:left" data-person="${p.id}"><div class="avatar">${esc(initials(p.name))}</div><div class="person-main"><h3>${esc(p.name||`Mystery #${p.id}`)}</h3><p>#${String(p.id).padStart(3,'0')} · ${es.length}×</p></div><div class="rating">★ ${avg}</div></button>`}).join(''):`<div class="card empty">Nobody here yet.</div>`}
 ${nav('collection')}`;
 document.querySelectorAll('[data-person]').forEach(x=>x.onclick=()=>{state.selectedPersonId=Number(x.dataset.person);state.screen='person';render()});attachNav();
}

(async()=>{db=await openDB();render();if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{})})();
