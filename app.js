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
  if(state.screen==='about') return renderAboutHim();
  if(state.screen==='penis') return renderPenis();
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

    <div class="quick-field mental-note-field">
      <textarea id="memory" maxlength="60" placeholder="What you’ll remember him by…">${esc(state.quick.memory||'')}</textarea>
    </div>

    <div class="quick-rating-block">
      <div class="quick-rating star-rating-wide" aria-label="Rating from 1 to 5">
        ${[1,2,3,4,5].map(n=>`<button class="star-wide-btn ${n<=Number(state.quick.rating||0)?'on':''}" data-star="${n}" aria-label="Rating ${n} out of 5">★</button>`).join('')}
      </div>
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
  app.innerHTML=`<main class="postadd-clean">
    <div class="postadd-confirm">
      <div class="eyebrow">ADDED</div>
      <h1>${esc(displayName(p))}</h1>
      ${p.lastMemory?`<p>${esc(p.lastMemory)}</p>`:''}
    </div>
    <div class="postadd-two">
      <button class="postadd-choice" id="aboutChoice"><span>ABOUT HIM</span><b>›</b></button>
      <button class="postadd-choice" id="encounterChoice"><span>ENCOUNTER</span><b>›</b></button>
    </div>
    <button class="postadd-done" id="done">DONE</button>
  </main>`;
  document.getElementById('aboutChoice').onclick=()=>{state.screen='about';render()};
  document.getElementById('encounterChoice').onclick=()=>{state.detailsTab='happened';state.detailsReturn='postadd';state.screen='details';render()};
  document.getElementById('done').onclick=()=>{state.screen='person';render()};
}




async function renderAboutHim(){
  const p=await get('people',state.selectedPersonId);
  p.about ||= {};
  const a=p.about;
  state.aboutPage ||= 'age';

  const ageBandFor=n=> n<30?'young':n<40?'30s':n<50?'middle':'older';
  const ageBandLabel=x=>({young:'Young','30s':'30s',middle:'Middle age',older:'Older'})[x]||'';
  const age=Number(a.ageExact||32);
  const ageBand=a.ageExact?ageBandFor(age):(a.ageBand||'30s');

  const height=Number(a.heightExact||180);
  const heightBandFor=n=>n<174?'short':n<187?'medium':'tall';
  const heightBandLabel=x=>({short:'Short',medium:'Medium',tall:'Tall'})[x]||'';
  const heightBand=a.heightExact?heightBandFor(height):(a.heightBand||'medium');

  const weight=Number(a.weightExact||80);
  const builds=['slim','average','athletic','big'];
  const build=(Array.isArray(a.build)&&a.build[0])||a.buildVisual||'average';

  const typeAnchors=[
    {key:'twink',label:'TWINK',angle:-90},
    {key:'bear',label:'BEAR',angle:0},
    {key:'daddy',label:'DADDY',angle:90},
    {key:'otter',label:'OTTER',angle:180}
  ];
  const normAngle=x=>((x%360)+360)%360;
  const typeFromAngle=deg=>{
    const a=normAngle(deg);
    // Quadrants blend between the four anchor archetypes.
    if(a>=337.5 || a<22.5) return {key:'bear',label:'BEAR'};
    if(a<67.5) return {key:'daddy-bear',label:'DADDY BEAR'};
    if(a<112.5) return {key:'daddy',label:'DADDY'};
    if(a<157.5) return {key:'otter-daddy',label:'OTTER DADDY'};
    if(a<202.5) return {key:'otter',label:'OTTER'};
    if(a<247.5) return {key:'twonk',label:'TWONK'};
    if(a<292.5) return {key:'twink',label:'TWINK'};
    return {key:'young-bear',label:'YOUNG BEAR'};
  };
  let typeAngle=Number.isFinite(Number(a.typeAngle))?Number(a.typeAngle):270;
  let typeNow=typeFromAngle(typeAngle);

  const figure=(extra='')=>`<div class="guy-stage ${extra}">
    <div class="guy-head"></div><div class="guy-neck"></div><div class="guy-body"></div>
    <div class="guy-leg guy-leg-l"></div><div class="guy-leg guy-leg-r"></div>
  </div>`;

  let panel='';
  if(state.aboutPage==='age'){
    const exact=!!a.ageExact;
    panel=`<section class="visual-panel age-panel">
      <div class="visual-value mode-value"><strong id="ageValue">${exact?age:ageBandLabel(ageBand)}</strong><span id="ageUnit">${exact?'years':''}</span></div>
      <div class="figure-wrap visual-photo-wrap age-photo-wrap"><img id="agePortrait" class="visual-photo age-photo" src="assets/age-${ageBand}.jpg?v=36" alt=""></div>
      <input id="ageSlider" class="range age-range" type="range" min="18" max="80" value="${age}" aria-label="Exact age">
      <div class="quick-categories age-cats">
        ${['young','30s','middle','older'].map(x=>`<button data-age-band="${x}" class="${!exact&&ageBand===x?'on':''}">${ageBandLabel(x)}</button>`).join('')}
      </div>
    </section>`;
  }else if(state.aboutPage==='body'){
    const exactH=!!a.heightExact, exactW=!!a.weightExact;
    panel=`<section class="visual-panel body-panel-v3">
      <div class="body-visual-grid">
        <div class="height-control">
          <div class="height-label-rail">
            <button class="axis-label tall">Tall</button>
            <button class="axis-label medium">Medium</button>
            <button class="axis-label short">Short</button>
          </div>
          <div class="height-slider-rail">
            <input id="heightSlider" class="vertical-range" type="range" min="150" max="210" value="${height}" orient="vertical" aria-label="Exact height">
          </div>
        </div>
        <div class="body-center">
          <div class="body-summary"><strong id="heightValue">${exactH?height+' cm':heightBandLabel(heightBand)}</strong><span id="buildSummary">${build?build[0].toUpperCase()+build.slice(1):''}</span></div>
          <div class="figure-wrap body-figure-wrap visual-photo-wrap"><img id="bodyPortrait" class="visual-photo body-photo" src="assets/body-${build}.jpg?v=36" alt=""></div>
        </div>
      </div>
      <div class="weight-block">
        <div class="mode-value weight-value"><strong id="weightValue">${exactW?weight+' kg':'Weight'}</strong></div>
        <input id="weightSlider" class="range weight-range" type="range" min="50" max="110" value="${Math.max(50,Math.min(110,weight))}" aria-label="Exact weight">
      </div>
      <div class="build-label">BUILD</div>
      <div class="quick-categories build-cats">
        ${builds.map(x=>`<button data-build="${x}" class="${!exactW&&build===x?'on':''}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}
      </div>
    </section>`;
  }else{
    panel=`<section class="visual-panel type-panel-v3">
      <div class="type-value" id="typeValue">${typeNow.label}</div>
      <div class="type-wheel" id="typeWheel">
        <span class="wheel-label wl-twink">TWINK</span>
        <span class="wheel-label wl-bear">BEAR</span>
        <span class="wheel-label wl-daddy">DADDY</span>
        <span class="wheel-label wl-otter">OTTER</span>
        <div class="wheel-track"></div>
        <div class="wheel-face ${typeNow.key}" id="wheelFace"><img id="typePortrait" class="type-photo" src="assets/type-${({twink:"twink",twonk:"twonk",otter:"otter","otter-daddy":"average",daddy:"daddy","daddy-bear":"bear",bear:"bear","young-bear":"bear"}[typeNow.key]||"average")}.jpg?v=36" alt=""></div>
        <div class="wheel-knob" id="wheelKnob"></div>
      </div>
      <div class="type-help">Drag around the circle</div>
    </section>`;
  }

  app.innerHTML=`<main class="about-visual">
    <div class="about-top"><button class="about-back" id="back">‹</button><div>ABOUT HIM</div><span></span></div>
    <nav class="about-tabs">
      <button data-page="age" class="${state.aboutPage==='age'?'on':''}">AGE</button>
      <button data-page="body" class="${state.aboutPage==='body'?'on':''}">BODY</button>
      <button data-page="type" class="${state.aboutPage==='type'?'on':''}">TYPE</button>
    </nav>
    <div class="about-swipe-area" id="aboutSwipe">${panel}</div>
    <div class="about-symbols persistent-symbols">
      <button class="about-symbol art-symbol" data-subopen="egg"><img src="assets/detail-eggplant.jpg?v=36" alt=""></button>
      <button class="about-symbol art-symbol" data-subopen="peach"><img src="assets/detail-peach.jpg?v=36" alt=""></button>
      <button class="about-symbol art-symbol" data-subopen="drop"><img src="assets/detail-drops.jpg?v=36" alt=""></button>
    </div>
  </main>`;

  document.getElementById('back').onclick=async()=>{await persist();state.screen='postadd';render()};
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.aboutPage=b.dataset.page;render()});
  document.querySelectorAll('[data-subopen]').forEach(b=>b.onclick=()=>{
      if(b.dataset.subopen==='egg'){state.screen='penis';render();return;}
      state.detailsTab='anatomy';state.detailsReturn='about';state.anatomySub=b.dataset.subopen;state.screen='details';render()
    });

  const persist=async()=>{const current=await get('people',state.selectedPersonId);current.about={...(current.about||{}),...(p.about||{})};await put('people',current)};

  if(state.aboutPage==='age'){
    const s=document.getElementById('ageSlider'),v=document.getElementById('ageValue'),u=document.getElementById('ageUnit');
    const paintAge=()=>{
      const n=Number(s.value),band=ageBandFor(n);
      v.textContent=n;u.textContent='years';p.about.ageExact=String(n);p.about.ageBand=band;
      document.querySelectorAll('[data-age-band]').forEach(x=>x.classList.toggle('soft-on',x.dataset.ageBand===band));
      document.querySelectorAll('[data-age-band]').forEach(x=>x.classList.remove('on'));
      const fig=document.getElementById('agePortrait');
      if(fig){fig.src=`assets/age-${band}.jpg?v=36`;fig.style.filter='';fig.style.transform='scale(1)'}
    };
    s.oninput=paintAge; s.onchange=async()=>{paintAge();await persist()};
    document.querySelectorAll('[data-age-band]').forEach(b=>b.onclick=async()=>{
      p.about.ageExact='';p.about.ageBand=b.dataset.ageBand;v.textContent=ageBandLabel(b.dataset.ageBand);u.textContent='';document.getElementById('agePortrait').src=`assets/age-${b.dataset.ageBand}.jpg?v=36`;
      document.querySelectorAll('[data-age-band]').forEach(x=>{x.classList.toggle('on',x===b);x.classList.remove('soft-on')});
      await persist();
    });
    if(a.ageExact) paintAge();
  }

  if(state.aboutPage==='body'){
    const hs=document.getElementById('heightSlider'),hv=document.getElementById('heightValue');
    const ws=document.getElementById('weightSlider'),wv=document.getElementById('weightValue');
    const fig=document.getElementById('bodyPortrait');
    const paintHeight=()=>{
      const n=Number(hs.value),band=heightBandFor(n);p.about.heightExact=String(n);p.about.heightBand=band;hv.textContent=n+' cm';
      if(fig){fig.style.transform=`scaleY(${.90+(n-150)/60*.20})`}
      document.querySelectorAll('.axis-label').forEach(x=>x.classList.toggle('soft-on',x.classList.contains(band)));
    };
    const paintWeight=()=>{
      const n=Number(ws.value);p.about.weightExact=String(n);wv.textContent=n+' kg';
      
    };
    hs.oninput=paintHeight; ws.oninput=paintWeight; hs.onchange=async()=>{paintHeight();await persist()}; ws.onchange=async()=>{paintWeight();await persist()};
    document.querySelectorAll('.axis-label').forEach(lbl=>lbl.onclick=async()=>{
      const band=lbl.classList.contains('tall')?'tall':lbl.classList.contains('short')?'short':'medium';
      p.about.heightExact='';p.about.heightBand=band;hv.textContent=heightBandLabel(band);
      document.querySelectorAll('.axis-label').forEach(x=>x.classList.toggle('on',x===lbl));
      await persist();
    });
    document.querySelectorAll('[data-build]').forEach(b=>b.onclick=async()=>{
      p.about.build=[b.dataset.build];p.about.buildVisual=b.dataset.build;document.getElementById('buildSummary').textContent=b.textContent;document.getElementById('bodyPortrait').src=`assets/body-${b.dataset.build}.jpg?v=36`;
      document.querySelectorAll('[data-build]').forEach(x=>x.classList.toggle('on',x===b));
      await persist();
    });
  }

  if(state.aboutPage==='type'){
    const wheel=document.getElementById('typeWheel'),knob=document.getElementById('wheelKnob'),value=document.getElementById('typeValue'),face=document.getElementById('wheelFace');
    const paint=deg=>{
      typeAngle=normAngle(deg);typeNow=typeFromAngle(typeAngle);p.about.typeAngle=String(typeAngle);p.about.types=[typeNow.key];
      const r=116,rad=typeAngle*Math.PI/180,cx=140,cy=140;
      knob.style.left=(cx+Math.cos(rad)*r-9)+'px';knob.style.top=(cy+Math.sin(rad)*r-9)+'px';
      value.textContent=typeNow.label;face.className='wheel-face '+typeNow.key;face.dataset.type=typeNow.key;
      const im=document.getElementById('typePortrait');
      if(im){const map={twink:'twink',twonk:'twonk',otter:'otter','otter-daddy':'average',daddy:'daddy','daddy-bear':'bear',bear:'bear','young-bear':'bear'};im.src=`assets/type-${map[typeNow.key]||'average'}.jpg?v=36`;}
    };
    const point=e=>{
      const rect=wheel.getBoundingClientRect(),t=e.touches?e.touches[0]:e;
      const x=t.clientX-(rect.left+rect.width/2),y=t.clientY-(rect.top+rect.height/2);
      paint(Math.atan2(y,x)*180/Math.PI);
    };
    wheel.onpointerdown=e=>{wheel.setPointerCapture(e.pointerId);point(e)}; wheel.onpointerup=async e=>{point(e);await persist()};
    wheel.onpointermove=e=>{if(e.buttons)point(e)};
    wheel.ontouchmove=e=>{point(e);e.preventDefault()}; wheel.ontouchend=async()=>{await persist()};
    paint(typeAngle);
  }
}


async function renderPenis(){
  const p=await get('people',state.selectedPersonId);
  p.about ||= {};
  p.about.penis ||= {};
  const d=p.about.penis;

  const lengthCats=['small','average','big','huge'];
  const girthCats=['slim','average','thick','very-thick'];
  const curves=['up','straight','down','left','right'];

  app.innerHTML=`<main class="private-detail-screen">
    <div class="about-top">
      <button class="about-back" id="backPenis">‹</button>
      <div>DETAILS</div><span></span>
    </div>

    <section class="detail-hero">
      <img class="detail-hero-icon" src="assets/detail-eggplant.jpg?v=36" alt="">
    </section>

    <section class="detail-block">
      <div class="detail-title-row">
        <span>LENGTH</span>
        <button class="exact-toggle" id="toggleLength">${d.lengthExact?'Use category':'Exact'}</button>
      </div>
      <div class="detail-pills four">
        ${lengthCats.map(x=>`<button data-length="${x}" class="${!d.lengthExact&&d.length===x?'on':''}">${x==='very-thick'?'Very thick':x[0].toUpperCase()+x.slice(1)}</button>`).join('')}
      </div>
      <div class="exact-wrap ${d.lengthExact?'show':''}" id="lengthExactWrap">
        <div class="exact-value"><strong id="lengthExactValue">${d.lengthExact||17}</strong><span>cm</span></div>
        <input id="lengthExactSlider" type="range" min="8" max="30" step="0.5" value="${d.lengthExact||17}">
      </div>
    </section>

    <section class="detail-block">
      <div class="detail-title-row">
        <span>GIRTH</span>
        <button class="exact-toggle" id="toggleGirth">${d.girthExact?'Use category':'Exact'}</button>
      </div>
      <div class="detail-pills four">
        ${girthCats.map(x=>`<button data-girth="${x}" class="${!d.girthExact&&d.girth===x?'on':''}">${x==='very-thick'?'Very thick':x[0].toUpperCase()+x.slice(1)}</button>`).join('')}
      </div>
      <div class="exact-wrap ${d.girthExact?'show':''}" id="girthExactWrap">
        <div class="exact-value"><strong id="girthExactValue">${d.girthExact||12}</strong><span>cm circumference</span></div>
        <input id="girthExactSlider" type="range" min="7" max="20" step="0.5" value="${d.girthExact||12}">
      </div>
    </section>

    <section class="detail-block split-block">
      <div>
        <div class="detail-label">FORESKIN</div>
        <div class="detail-pills two">
          <button data-cut="cut" class="${d.cut==='cut'?'on':''}">Cut</button>
          <button data-cut="uncut" class="${d.cut==='uncut'?'on':''}">Uncut</button>
        </div>
      </div>
      <div>
        <div class="detail-label">VEINS</div>
        <div class="detail-pills two">
          <button data-veins="smooth" class="${d.veins==='smooth'?'on':''}">Smooth</button>
          <button data-veins="veiny" class="${d.veins==='veiny'?'on':''}">Veiny</button>
        </div>
      </div>
    </section>

    <section class="detail-block">
      <div class="detail-label">CURVE</div>
      <div class="curve-grid">
        <button data-curve="up" class="${d.curve==='up'?'on':''}"><span class="curve-glyph">↗</span><small>Up</small></button>
        <button data-curve="straight" class="${d.curve==='straight'?'on':''}"><span class="curve-glyph">→</span><small>Straight</small></button>
        <button data-curve="down" class="${d.curve==='down'?'on':''}"><span class="curve-glyph">↘</span><small>Down</small></button>
        <button data-curve="left" class="${d.curve==='left'?'on':''}"><span class="curve-glyph">↙</span><small>Left</small></button>
        <button data-curve="right" class="${d.curve==='right'?'on':''}"><span class="curve-glyph">↘</span><small>Right</small></button>
      </div>
    </section>
  </main>`;

  const save=async()=>{
    const current=await get('people',state.selectedPersonId);
    current.about ||= {};
    current.about.penis={...d};
    await put('people',current);
  };

  document.getElementById('backPenis').onclick=async()=>{await save();state.screen='about';render()};

  document.querySelectorAll('[data-length]').forEach(b=>b.onclick=async()=>{
    d.length=b.dataset.length;d.lengthExact='';
    document.querySelectorAll('[data-length]').forEach(x=>x.classList.toggle('on',x===b));
    document.getElementById('lengthExactWrap').classList.remove('show');
    document.getElementById('toggleLength').textContent='Exact';
    await save();
  });

  document.querySelectorAll('[data-girth]').forEach(b=>b.onclick=async()=>{
    d.girth=b.dataset.girth;d.girthExact='';
    document.querySelectorAll('[data-girth]').forEach(x=>x.classList.toggle('on',x===b));
    document.getElementById('girthExactWrap').classList.remove('show');
    document.getElementById('toggleGirth').textContent='Exact';
    await save();
  });

  document.getElementById('toggleLength').onclick=async e=>{
    const w=document.getElementById('lengthExactWrap');
    if(w.classList.contains('show')){
      d.lengthExact='';w.classList.remove('show');e.currentTarget.textContent='Exact';await save();
    }else{
      w.classList.add('show');e.currentTarget.textContent='Use category';
      const s=document.getElementById('lengthExactSlider');d.lengthExact=s.value;await save();
      document.querySelectorAll('[data-length]').forEach(x=>x.classList.remove('on'));
    }
  };

  document.getElementById('toggleGirth').onclick=async e=>{
    const w=document.getElementById('girthExactWrap');
    if(w.classList.contains('show')){
      d.girthExact='';w.classList.remove('show');e.currentTarget.textContent='Exact';await save();
    }else{
      w.classList.add('show');e.currentTarget.textContent='Use category';
      const s=document.getElementById('girthExactSlider');d.girthExact=s.value;await save();
      document.querySelectorAll('[data-girth]').forEach(x=>x.classList.remove('on'));
    }
  };

  const ls=document.getElementById('lengthExactSlider');
  ls.oninput=()=>{document.getElementById('lengthExactValue').textContent=ls.value;d.lengthExact=ls.value};
  ls.onchange=save;

  const gs=document.getElementById('girthExactSlider');
  gs.oninput=()=>{document.getElementById('girthExactValue').textContent=gs.value;d.girthExact=gs.value};
  gs.onchange=save;

  document.querySelectorAll('[data-cut]').forEach(b=>b.onclick=async()=>{
    d.cut=b.dataset.cut;document.querySelectorAll('[data-cut]').forEach(x=>x.classList.toggle('on',x===b));await save()
  });
  document.querySelectorAll('[data-veins]').forEach(b=>b.onclick=async()=>{
    d.veins=b.dataset.veins;document.querySelectorAll('[data-veins]').forEach(x=>x.classList.toggle('on',x===b));await save()
  });
  document.querySelectorAll('[data-curve]').forEach(b=>b.onclick=async()=>{
    d.curve=b.dataset.curve;document.querySelectorAll('[data-curve]').forEach(x=>x.classList.toggle('on',x===b));await save()
  });
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
 if(tab==='anatomy'){
   const sub=state.anatomySub||'egg';
   body=`<p class="sub">Private details, only if you care. Nothing here is required.</p><div class="tabs"><button class="tab ${sub==='egg'?'on':''}" data-sub="egg">🍆</button><button class="tab ${sub==='peach'?'on':''}" data-sub="peach">🍑</button><button class="tab ${sub==='drop'?'on':''}" data-sub="drop">💦</button></div><div id="anatomyPanel">${sub==='egg'?anatomyEgg(p):sub==='peach'?anatomyPeach(p):anatomyDrop(p)}</div>`;
 }
 app.innerHTML=`<button class="linkbtn" id="back">← Back</button><h1 class="screen-title">${tab==='anatomy'?'The details':tab[0].toUpperCase()+tab.slice(1)}</h1>${body}<div style="height:16px"></div><button class="primary" id="save">SAVE</button><p class="small" style="text-align:center">🔒 On this device only</p>`;
 document.getElementById('back').onclick=()=>{state.screen=state.detailsReturn||'person';render()};
 if(tab==='anatomy') document.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{state.anatomySub=b.dataset.sub;document.querySelectorAll('[data-sub]').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById('anatomyPanel').innerHTML=b.dataset.sub==='egg'?anatomyEgg(p):b.dataset.sub==='peach'?anatomyPeach(p):anatomyDrop(p);attachAnatomyHandlers()});
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

function profileSummary(p){const bits=[];if(p.about?.ageExact)bits.push(`${esc(p.about.ageExact)} yrs`);else if(p.about?.ageBand)bits.push(esc(p.about.ageBand));if(p.about?.heightExact)bits.push(`${esc(p.about.heightExact)} cm`);else if(p.about?.heightBand)bits.push(esc(p.about.heightBand));return bits.join(' · ')}
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

(async()=>{
  db=await openDB();
  render();
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=3.6');
      await reg.update();
      let refreshing=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(refreshing) return;
        refreshing=true;
        location.reload();
      });
    }catch(e){}
  }
})();

