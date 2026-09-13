
async function ensureFirstEncounter(personId){
  const xs=await all('encounters');
  const found=xs.find(e=>e.personId===personId);
  if(found) return found;
  const today=new Date().toISOString().slice(0,10);
  const e={id:uid(),personId,date:today,when:{precision:'exact',date:today},happened:[],happenedDetails:{},rating:0,createdAt:Date.now()};
  await put('encounters',e); return e;
}
const DB_NAME='bodycount-db-v2';
const DB_VERSION=2;
const APP_VERSION='10.17';
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
      if(!d.objectStoreNames.contains('photos')) d.createObjectStore('photos',{keyPath:'personId'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((r,j)=>{const q=store(name).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function get(name,id){return new Promise((r,j)=>{const q=store(name).get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function put(name,value){return new Promise((r,j)=>{const q=store(name,'readwrite').put(value);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function add(name,value){return new Promise((r,j)=>{const q=store(name,'readwrite').add(value);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function remove(name,id){return new Promise((r,j)=>{const q=store(name,'readwrite').delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}

function bytesToBase64(bytes){
  let out='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) out+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(out);
}
function base64ToBytes(value){
  const raw=atob(value);
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
async function blobToBackup(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  return {type:blob.type||'application/octet-stream',data:bytesToBase64(bytes)};
}
function backupToBlob(value){
  return new Blob([base64ToBytes(value.data)],{type:value.type||'application/octet-stream'});
}
async function deriveBackupKey(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},
    material,
    {name:'AES-GCM',length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function makeEncryptedBackup(password){
  const [people,encounters,settings,photos]=await Promise.all([
    all('people'),all('encounters'),all('settings'),all('photos')
  ]);
  const photoRows=[];
  for(const p of photos){
    photoRows.push({
      personId:p.personId,
      updatedAt:p.updatedAt||null,
      blob:await blobToBackup(p.blob)
    });
  }
  const payload={
    format:'body-count-backup',
    version:1,
    appVersion:APP_VERSION,
    exportedAt:new Date().toISOString(),
    people,encounters,settings,photos:photoRows
  };
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveBackupKey(password,salt);
  const ciphertext=await crypto.subtle.encrypt(
    {name:'AES-GCM',iv},
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return {
    format:'body-count-encrypted-backup',
    version:1,
    kdf:{name:'PBKDF2',hash:'SHA-256',iterations:250000,salt:bytesToBase64(salt)},
    cipher:{name:'AES-GCM',iv:bytesToBase64(iv)},
    data:bytesToBase64(new Uint8Array(ciphertext))
  };
}
const MAX_BACKUP_FILE_BYTES=200*1024*1024;
const MAX_BACKUP_PEOPLE=10000;
const MAX_BACKUP_ENCOUNTERS=50000;
const MAX_BACKUP_PHOTOS=10000;
const MAX_BACKUP_PHOTO_BYTES=12*1024*1024;

function assertSafeBackupTree(value,depth=0){
  if(depth>20) throw new Error('Backup nesting is too deep');
  if(typeof value==='string'){
    if(value.length>100000) throw new Error('Backup text field is too large');
    return;
  }
  if(value===null || ['number','boolean'].includes(typeof value)) return;
  if(Array.isArray(value)){
    if(value.length>100000) throw new Error('Backup array is too large');
    value.forEach(v=>assertSafeBackupTree(v,depth+1));
    return;
  }
  if(typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(k==='__proto__'||k==='prototype'||k==='constructor') throw new Error('Unsafe backup key');
      assertSafeBackupTree(v,depth+1);
    }
    return;
  }
  throw new Error('Unsupported backup value');
}
function assertSafeId(value,label){
  if(!Number.isSafeInteger(value)||value<=0) throw new Error(`Invalid ${label}`);
}
function validateBackupPayload(payload){
  if(payload?.format!=='body-count-backup'||payload?.version!==1) throw new Error('Unsupported backup data');
  if(!Array.isArray(payload.people)||!Array.isArray(payload.encounters)||!Array.isArray(payload.photos)) throw new Error('Invalid backup data');
  payload.settings=Array.isArray(payload.settings)?payload.settings:[];
  if(payload.people.length>MAX_BACKUP_PEOPLE||payload.encounters.length>MAX_BACKUP_ENCOUNTERS||payload.photos.length>MAX_BACKUP_PHOTOS) throw new Error('Backup is too large');

  assertSafeBackupTree(payload);

  const personIds=new Set();
  payload.people.forEach(p=>{
    assertSafeId(p?.id,'person id');
    if(personIds.has(p.id)) throw new Error('Duplicate person id');
    personIds.add(p.id);
  });

  const encounterIds=new Set();
  payload.encounters.forEach(e=>{
    assertSafeId(e?.id,'encounter id');
    assertSafeId(e?.personId,'encounter person id');
    if(encounterIds.has(e.id)) throw new Error('Duplicate encounter id');
    if(!personIds.has(e.personId)) throw new Error('Encounter references a missing person');
    encounterIds.add(e.id);
    if(e.rating!==undefined && (!Number.isFinite(Number(e.rating))||Number(e.rating)<0||Number(e.rating)>5)) throw new Error('Invalid rating');
  });

  const allowedPhotoTypes=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
  const photoIds=new Set();
  payload.photos.forEach(x=>{
    assertSafeId(Number(x?.personId),'photo person id');
    const personId=Number(x.personId);
    if(!personIds.has(personId)||photoIds.has(personId)) throw new Error('Invalid photo reference');
    photoIds.add(personId);
    if(!x?.blob||typeof x.blob.data!=='string'||!allowedPhotoTypes.has(String(x.blob.type||'').toLowerCase())) throw new Error('Invalid photo');
    const approxBytes=Math.floor(x.blob.data.length*3/4);
    if(approxBytes>MAX_BACKUP_PHOTO_BYTES) throw new Error('Photo is too large');
  });
  return payload;
}
async function decryptBackupFile(file,password){
  if(!file||file.size>MAX_BACKUP_FILE_BYTES) throw new Error('Backup file is too large');
  const wrapper=JSON.parse(await file.text());
  if(wrapper?.format!=='body-count-encrypted-backup'||wrapper?.version!==1) throw new Error('Unsupported backup file');
  if(wrapper?.kdf?.name!=='PBKDF2'||wrapper?.kdf?.hash!=='SHA-256'||wrapper?.kdf?.iterations!==250000) throw new Error('Unsupported backup encryption');
  if(wrapper?.cipher?.name!=='AES-GCM') throw new Error('Unsupported backup cipher');
  if(typeof wrapper.data!=='string'||wrapper.data.length>MAX_BACKUP_FILE_BYTES*2) throw new Error('Invalid encrypted payload');
  const salt=base64ToBytes(wrapper.kdf?.salt||'');
  const iv=base64ToBytes(wrapper.cipher?.iv||'');
  if(salt.length!==16||iv.length!==12) throw new Error('Invalid encryption parameters');
  const key=await deriveBackupKey(password,salt);
  const plain=await crypto.subtle.decrypt(
    {name:'AES-GCM',iv},
    key,
    base64ToBytes(wrapper.data||'')
  );
  const payload=JSON.parse(new TextDecoder().decode(plain));
  return validateBackupPayload(payload);
}
async function replaceAllData(payload){
  const names=['people','encounters','settings','photos'];
  const tx=db.transaction(names,'readwrite');
  const stores=Object.fromEntries(names.map(n=>[n,tx.objectStore(n)]));
  names.forEach(n=>stores[n].clear());
  (payload.people||[]).forEach(x=>stores.people.put(x));
  (payload.encounters||[]).forEach(x=>stores.encounters.put(x));
  (payload.settings||[]).forEach(x=>stores.settings.put(x));
  (payload.photos||[]).forEach(x=>stores.photos.put({
    personId:Number(x.personId),
    updatedAt:x.updatedAt||Date.now(),
    blob:backupToBlob(x.blob)
  }));
  await new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('Restore aborted'));
  });
}
async function deleteAllData(){
  const names=['people','encounters','settings','photos'];
  const tx=db.transaction(names,'readwrite');
  names.forEach(n=>tx.objectStore(n).clear());
  await new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('Delete aborted'));
  });
}

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials=s=>{const t=(s||'?').trim(); return t==='?'?'?':t.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()};
const fmt=d=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(d));
const dateValue=d=>{const x=new Date(d||Date.now()),off=x.getTimezoneOffset();return new Date(x.getTime()-off*60000).toISOString().slice(0,10)};
const displayName=p=>p?.name?.trim()||`Guy #${p?.anonymousNumber||p?.id}`;
const avgRating=es=>{const r=es.filter(e=>e.rating>0);return r.length?(r.reduce((s,e)=>s+e.rating,0)/r.length).toFixed(1):'—'};

let activePhotoUrls=[];
function clearPhotoUrls(){
  activePhotoUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});
  activePhotoUrls=[];
}
async function personPhoto(personId){
  try{return await get('photos',Number(personId))}catch(e){return null}
}
function photoObjectUrl(record){
  if(!record?.blob)return '';
  const u=URL.createObjectURL(record.blob);
  activePhotoUrls.push(u);
  return u;
}
async function optimizePhoto(file){
  if(!file || !file.type?.startsWith('image/')) throw new Error('Not an image');
  const src=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{
      const i=new Image();
      i.onload=()=>resolve(i);
      i.onerror=()=>reject(new Error('Image could not be opened'));
      i.src=src;
    });
    const maxSide=1800;
    let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    const scale=Math.min(1,maxSide/Math.max(w,h));
    w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#090909'; ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
    return blob||file;
  }finally{
    URL.revokeObjectURL(src);
  }
}
async function savePersonPhoto(personId,file){
  const blob=await optimizePhoto(file);
  await put('photos',{personId:Number(personId),blob,updatedAt:Date.now()});
}


async function render(){
  clearPhotoUrls();
  if(state.screen==='home') return renderHome();
  if(state.screen==='add') return renderAdd();
  if(state.screen==='postadd') return renderPostAdd();
  if(state.screen==='about') return renderAboutHim();
  if(state.screen==='penis') return renderPenis();
  if(state.screen==='peach') return renderPeach();
  if(state.screen==='drops') return renderDrops();
  if(state.screen==='person') return renderPerson();
  if(state.screen==='collection') return renderCollection();
  if(state.screen==='timeline') return renderTimeline();
  if(state.screen==='insights') return renderStats();
  if(state.screen==='you') return renderSettings();
  if(state.screen==='backup') return renderBackup();
  if(state.screen==='details') return renderDetails();
  if(state.screen==='encounter') return renderEncounter();
  if(state.screen==='encounterEdit') return renderEncounterEdit();

  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
    const n=b.dataset.nav;
    if(n==='count') state.screen='home';
    if(n==='people') state.screen='people';
    if(n==='insights') state.screen='insights';
    if(n==='you') state.screen='you';
    render();
  });
}
function nav(active='home'){
  return `<nav class="bottom-nav">
    <button class="navbtn ${active==='home'?'active':''}" data-nav="home"><span class="nav-ico">○</span><span>COUNT</span></button>
    <button class="navbtn ${active==='collection'?'active':''}" data-nav="collection"><span class="nav-ico">◫</span><span>PEOPLE</span></button>
    <button class="navbtn ${active==='insights'?'active':''}" data-nav="insights"><span class="nav-ico">⌁</span><span>STATS</span></button>
    <button class="navbtn ${active==='you'?'active':''}" data-nav="you"><span class="nav-ico">◌</span><span>SETTINGS</span></button>
  </nav>`;
}
function attachNav(){document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.nav;render()})}

async function renderHome(){
  const people=await all('people');
  const count=people.length;

  app.innerHTML=`<main class="count-home">
    <div class="count-brand">BODY COUNT</div>
    <button class="home-privacy-slogan" id="homePrivacy" type="button">Stored privately on this device</button>

    <div class="count-center">
      <div class="count-lockup count-digits-${Math.min(3,String(count).length)}">
        <div class="count-number" id="countNumber">0</div>
        <button class="count-add" id="countAdd" aria-label="Add a person">+</button>
      </div>
    </div>

    <div class="privacy-modal" id="privacyModal" hidden>
      <button class="privacy-backdrop" id="privacyBackdrop" aria-label="Close"></button>
      <section class="privacy-sheet" role="dialog" aria-modal="true" aria-labelledby="privacyTitle">
        <button class="privacy-close" id="privacyClose" aria-label="Close">×</button>
        <h2 id="privacyTitle">Your data stays here.</h2>
        <p>Body Count stores your data locally on this device. Nothing is sent to a Body Count server.</p>
        <p class="privacy-note">Browser or device storage can still be removed, so local storage is not a backup.</p>
      </section>
    </div>

    ${nav('home')}
  </main>`;

  const number=document.getElementById('countNumber');
  const startCountPulse=()=>number.classList.add('count-settled');
  if(count===0){
    number.textContent='0';
    startCountPulse();
  }else{
    const duration=1100;
    const start=performance.now();
    const tick=now=>{
      const t=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-t,3);
      number.textContent=String(Math.min(count,Math.floor(eased*count)));
      if(t<1) requestAnimationFrame(tick);
      else{
        number.textContent=String(count);
        startCountPulse();
      }
    };
    requestAnimationFrame(tick);
  }

  document.getElementById('countAdd').onclick=()=>{
    state.selectedPersonId=null;
    state.selectedEncounterId=null;
    state.quick={mode:'new',name:'',memory:''};
    state.screen='add';
    render();
  };

  const modal=document.getElementById('privacyModal');
  const openPrivacy=()=>{modal.hidden=false;document.body.classList.add('modal-open')};
  const closePrivacy=()=>{modal.hidden=true;document.body.classList.remove('modal-open')};
  document.getElementById('homePrivacy').onclick=openPrivacy;
  document.getElementById('privacyClose').onclick=closePrivacy;
  document.getElementById('privacyBackdrop').onclick=closePrivacy;

  attachNav();
}

async function renderStats(){
  const people=await all('people');
  const encounters=await all('encounters');
  const byPerson=new Map(people.map(p=>[p.id,[]]));
  encounters.forEach(e=>{if(byPerson.has(e.personId))byPerson.get(e.personId).push(e)});

  const uniquePeopleWith=predicate=>{
    const ids=new Set();
    encounters.forEach(e=>{if(predicate(e))ids.add(e.personId)});
    return ids.size;
  };
  const hasDetail=(e,activity,value)=>{
    if(!(e.happened||[]).includes(activity))return false;
    const vals=e.happenedDetails?.[activity];
    return Array.isArray(vals)?vals.includes(value):vals===value;
  };
  const sexStats=[
    ['GUYS I JERKED OFF',uniquePeopleWith(e=>hasDetail(e,'Handjob','I jerked him off'))],
    ['GUYS WHO JERKED ME OFF',uniquePeopleWith(e=>hasDetail(e,'Handjob','He jerked me off'))],
    ['DICKS I SUCKED',uniquePeopleWith(e=>hasDetail(e,'Blowjob','I sucked')||hasDetail(e,'Oral','I sucked'))],
    ['GUYS WHO BLEW ME',uniquePeopleWith(e=>hasDetail(e,'Blowjob','He blew me')||hasDetail(e,'Oral','He sucked'))],
    ['GUYS I FUCKED',uniquePeopleWith(e=>hasDetail(e,'Fucking','I fucked him')||hasDetail(e,'Anal','I topped'))],
    ['GUYS WHO FUCKED ME',uniquePeopleWith(e=>hasDetail(e,'Fucking','He fucked me')||hasDetail(e,'Anal','He topped')||hasDetail(e,'Anal','I bottomed'))]
  ];

  const dist=(getter,order,labels)=>{
    const counts=new Map(order.map(k=>[k,0])); let known=0;
    people.forEach(p=>{const k=getter(p);if(counts.has(k)){counts.set(k,counts.get(k)+1);known++}});
    return {known,rows:order.map(k=>({label:labels[k]||k,value:counts.get(k)}))};
  };
  const getOne=v=>Array.isArray(v)?v[0]:v;
  const type=dist(p=>String(getOne(p.about?.types)||p.about?.type||'').toLowerCase(),['twink','bear','daddy','otter'],{twink:'Twink',bear:'Bear',daddy:'Daddy',otter:'Otter'});
  const build=dist(p=>String(getOne(p.about?.build)||p.about?.buildVisual||'').toLowerCase(),['slim','average','athletic','big'],{slim:'Slim',average:'Average',athletic:'Athletic',big:'Big'});
  const height=dist(p=>String(p.about?.heightBand||'').toLowerCase(),['short','medium','tall'],{short:'Short',medium:'Medium',tall:'Tall'});
  const age=dist(p=>String(p.about?.ageBand||'').toLowerCase(),['young','30s','middle','older'],{young:'Young','30s':'30s',middle:'Middle age',older:'Older'});

  const barBlock=(title,d)=>{
    if(!d.known)return '';
    const max=Math.max(1,...d.rows.map(r=>r.value));
    return `<section class="stats-chart"><div class="stats-section-title">${title}</div><div class="stats-bars">${d.rows.map(r=>`<div class="stats-bar-row"><span>${r.label}</span><div class="stats-bar-track"><i style="width:${(r.value/max)*100}%"></i></div><strong>${r.value}</strong></div>`).join('')}</div><div class="stats-based">Based on ${d.known} ${d.known===1?'guy':'guys'}</div></section>`;
  };

  const repeaters=people.filter(p=>(byPerson.get(p.id)||[]).length>1);
  const oneHits=people.filter(p=>(byPerson.get(p.id)||[]).length===1);
  const mostSeen=[...people].sort((a,b)=>(byPerson.get(b.id)||[]).length-(byPerson.get(a.id)||[]).length)[0];
  const mostSeenN=mostSeen?(byPerson.get(mostSeen.id)||[]).length:0;
  const repeatRate=people.length?Math.round(repeaters.length/people.length*100):0;

  const rated=encounters.filter(e=>Number(e.rating)>0);
  const average=rated.length?(rated.reduce((n,e)=>n+Number(e.rating),0)/rated.length).toFixed(1):null;
  const fiveEnc=rated.filter(e=>Number(e.rating)===5).length;
  const fiveGuys=new Set(rated.filter(e=>Number(e.rating)===5).map(e=>e.personId)).size;

  const now=new Date(),thisYear=now.getFullYear(),thisMonth=now.getMonth()+1;
  const ym=e=>{
    const w=e.when||{};
    if((w.precision==='exact'||!w.precision)){
      const raw=String(w.date||e.date||'').slice(0,10),m=raw.match(/^(\d{4})-(\d{2})/);return m?[+m[1],+m[2]]:null;
    }
    if(w.precision==='month'&&w.year&&w.month)return [+w.year,+w.month];
    return null;
  };
  const exactMonths=encounters.map(e=>[e,ym(e)]).filter(x=>x[1]);
  const thisMonthN=exactMonths.filter(([,x])=>x[0]===thisYear&&x[1]===thisMonth).length;
  const inYear=e=>{const c=encounterChronology(e);return c.start<=Date.UTC(thisYear,11,31)&&c.end>=Date.UTC(thisYear,0,1)};
  const thisYearN=encounters.filter(inYear).length;
  const monthCounts=new Map();
  exactMonths.forEach(([,x])=>{const k=`${x[0]}-${String(x[1]).padStart(2,'0')}`;monthCounts.set(k,(monthCounts.get(k)||0)+1)});
  const busiest=[...monthCounts.entries()].sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0];
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const busiestLabel=busiest?(()=>{const [y,m]=busiest[0].split('-').map(Number);return `${monthNames[m-1]} ${y}`})():null;

  const typeWinner=type.known?[...type.rows].sort((a,b)=>b.value-a.value)[0]:null;
  const buildWinner=build.known?[...build.rows].sort((a,b)=>b.value-a.value)[0]:null;
  const ageWinner=age.known?[...age.rows].sort((a,b)=>b.value-a.value)[0]:null;
  const yourType=[buildWinner?.value?buildWinner.label:null,ageWinner?.value?ageWinner.label:null,typeWinner?.value?typeWinner.label:null].filter(Boolean).join(' · ');

  app.innerHTML=`<main class="stats-screen">
    <header class="stats-head"><h1>Stats</h1></header>
    <section class="stats-hero"><div class="stats-kicker">BODY COUNT</div><div class="stats-count">${people.length}</div><div class="stats-encounters">${encounters.length} ${encounters.length===1?'ENCOUNTER':'ENCOUNTERS'}</div></section>

    <section class="stats-section"><div class="stats-section-title">THE NUMBERS</div><div class="stats-number-grid">${sexStats.map(([label,value])=>`<div class="stats-number-card"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><div class="stats-based">Unique guys · based on recorded encounter details</div></section>

    <section class="stats-section"><div class="stats-section-title">ENCORES</div><div class="stats-mini-grid"><div><strong>${oneHits.length}</strong><span>ONE HIT WONDERS</span></div><div><strong>${repeaters.length}</strong><span>ENCORES</span></div><div><strong>${repeatRate}%</strong><span>ENCORE RATE</span></div><div><strong>${mostSeenN}</strong><span>MOST ENCOUNTERS</span></div></div>${mostSeenN>1?`<div class="stats-callout">${esc(displayName(mostSeen))}</div>`:''}</section>

    ${barBlock('TYPE',type)}${barBlock('BUILD',build)}${barBlock('HEIGHT',height)}${barBlock('AGE',age)}

    ${rated.length?`<section class="stats-section"><div class="stats-section-title">HOW WAS IT</div><div class="stats-mini-grid"><div><strong>★ ${average}</strong><span>AVERAGE RATING</span></div><div><strong>${fiveEnc}</strong><span>5 STAR ENCOUNTERS</span></div><div><strong>${fiveGuys}</strong><span>5 STAR GUYS</span></div><div><strong>${rated.length}</strong><span>RATED</span></div></div><div class="stats-based">Based on ${rated.length} rated ${rated.length===1?'encounter':'encounters'}</div></section>`:''}

    <section class="stats-section"><div class="stats-section-title">TIME</div><div class="stats-mini-grid"><div><strong>${thisYearN}</strong><span>THIS YEAR</span></div><div><strong>${thisMonthN}</strong><span>THIS MONTH</span></div>${busiest?`<div class="stats-wide"><strong>${busiest[1]}</strong><span>MOST ACTIVE MONTH · ${busiestLabel.toUpperCase()}</span></div>`:''}</div>${exactMonths.length?`<div class="stats-based">Monthly stats use encounters with an exact date or month</div>`:''}</section>

    ${(yourType||mostSeenN>1)?`<section class="stats-section stats-fun"><div class="stats-section-title">FUN STATS</div>${yourType?`<div class="stats-fun-row"><span>YOUR TYPE</span><strong>${esc(yourType)}</strong></div>`:''}${mostSeenN>1?`<div class="stats-fun-row"><span>COMEBACK KING</span><strong>${esc(displayName(mostSeen))} · ${mostSeenN} encounters</strong></div>`:''}${busiest?`<div class="stats-fun-row"><span>BUSIEST MONTH</span><strong>${busiestLabel}</strong></div>`:''}</section>`:''}
    ${nav('insights')}
  </main>`;
  attachNav();
}


function settingsPrivacyCopy(){
  return `<div class="settings-copy">
    <strong>Your data stays on this device.</strong>
    <p>People, encounters, private notes and photos are stored locally in this browser. Body Count does not upload them to a Body Count server.</p>
    <p>Local browser data can still be removed by the browser, the device or you, so it is not a backup. Exported backups are encrypted with the password you choose.</p>
  </div>`;
}

async function renderSettings(){
  app.innerHTML=`<main class="settings-screen">
    <header class="settings-head"><h1>Settings</h1></header>

    <section class="settings-section">
      <div class="settings-section-title">DATA</div>
      <button class="settings-row settings-row-button" id="openBackup" type="button">
        <span><strong>Backup</strong><small>Export or restore your data</small></span><b>›</b>
      </button>
    </section>

    <section class="settings-section">
      <div class="settings-section-title">PRIVACY</div>
      ${settingsPrivacyCopy()}
    </section>

    <section class="settings-section">
      <div class="settings-section-title">APP</div>
      <div class="settings-copy settings-app-copy">
        <strong>Body Count</strong>
        <p>Private hookup tracker · Version ${APP_VERSION}</p>
      </div>
    </section>

    <section class="settings-section settings-danger">
      <div class="settings-section-title">DANGER ZONE</div>
      <button class="settings-delete" id="deleteAllButton" type="button">
        <strong>Delete all data</strong><span>Permanently erase people, encounters, notes and photos</span>
      </button>
    </section>

    <div class="settings-modal" id="deleteAllModal" hidden>
      <button class="settings-modal-backdrop" id="deleteAllBackdrop" type="button" aria-label="Cancel"></button>
      <section class="settings-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="deleteAllTitle">
        <div class="settings-modal-head">
          <div><div class="settings-modal-kicker">DELETE EVERYTHING</div><h2 id="deleteAllTitle">This cannot be undone.</h2></div>
          <button class="settings-modal-close" id="deleteAllClose" type="button" aria-label="Cancel">×</button>
        </div>
        <p class="settings-modal-copy">Type <strong>DELETE</strong> to permanently erase all Body Count data on this device.</p>
        <input class="settings-password" id="deleteAllInput" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE">
        <button class="settings-confirm-delete" id="confirmDeleteAll" type="button" disabled>DELETE ALL DATA</button>
      </section>
    </div>

    <div class="settings-modal settings-success-modal" id="deleteSuccessModal" hidden>
      <button class="settings-modal-backdrop" id="deleteSuccessBackdrop" type="button" aria-label="Close"></button>
      <section class="settings-modal-sheet settings-success-sheet" role="status" aria-live="polite">
        <div class="settings-success-mark">✓</div>
        <h2>All data deleted.</h2>
        <p>People, encounters, notes and photos have been removed from this device.</p>
        <button class="backup-modal-action" id="deleteSuccessDone" type="button">DONE</button>
      </section>
    </div>

    ${nav('you')}
  </main>`;

  document.getElementById('openBackup').onclick=()=>{state.screen='backup';render()};
  const modal=document.getElementById('deleteAllModal');
  const input=document.getElementById('deleteAllInput');
  const confirm=document.getElementById('confirmDeleteAll');
  const openDelete=()=>{modal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>input.focus(),80)};
  const closeDelete=()=>{modal.hidden=true;document.body.classList.remove('modal-open');input.value='';confirm.disabled=true};
  document.getElementById('deleteAllButton').onclick=openDelete;
  document.getElementById('deleteAllBackdrop').onclick=closeDelete;
  document.getElementById('deleteAllClose').onclick=closeDelete;
  input.oninput=()=>{confirm.disabled=input.value.trim()!=='DELETE'};
  const successModal=document.getElementById('deleteSuccessModal');
  const closeSuccess=()=>{successModal.hidden=true;document.body.classList.remove('modal-open')};
  document.getElementById('deleteSuccessBackdrop').onclick=closeSuccess;
  document.getElementById('deleteSuccessDone').onclick=closeSuccess;

  confirm.onclick=async()=>{
    if(input.value.trim()!=='DELETE')return;
    confirm.disabled=true;confirm.textContent='DELETING…';
    try{
      await deleteAllData();
      closeDelete();
      state.selectedPersonId=null;state.selectedEncounterId=null;
      successModal.hidden=false;
      document.body.classList.add('modal-open');
    }catch(err){
      confirm.disabled=false;confirm.textContent='DELETE ALL DATA';
      alert('Your data could not be deleted.');
    }
  };
  attachNav();
}

async function renderBackup(){
  app.innerHTML=`<main class="backup-screen">
    <header class="backup-head">
      <button class="backup-back" id="backupBack" type="button" aria-label="Back">‹</button>
      <div><div class="backup-kicker">DATA</div><h1>Backup</h1></div>
      <span></span>
    </header>

    <section class="backup-intro">
      <p>Make one encrypted copy of your people, encounters, private notes and photos.</p>
      <div class="backup-lock-note">Nothing is uploaded anywhere.</div>
    </section>

    <section class="backup-actions">
      <button class="backup-action" id="exportBackup" type="button">
        <strong>EXPORT BACKUP</strong>
        <span>Create an encrypted .bodycount file</span>
      </button>
      <button class="backup-action" id="restoreBackup" type="button">
        <strong>RESTORE BACKUP</strong>
        <span>Replace this device’s data from a backup</span>
      </button>
      <input id="backupFileInput" type="file" accept=".bodycount,application/json" hidden>
    </section>

    <div class="settings-modal" id="backupPasswordModal" hidden>
      <button class="settings-modal-backdrop" id="backupPasswordBackdrop" type="button" aria-label="Cancel"></button>
      <section class="settings-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="backupPasswordTitle">
        <div class="settings-modal-head">
          <div><div class="settings-modal-kicker" id="backupPasswordKicker">ENCRYPTED BACKUP</div><h2 id="backupPasswordTitle">Choose a password</h2></div>
          <button class="settings-modal-close" id="backupPasswordClose" type="button" aria-label="Cancel">×</button>
        </div>
        <p class="settings-modal-copy" id="backupPasswordCopy">You’ll need this password to restore the backup. Body Count cannot recover it for you.</p>
        <input class="settings-password" id="backupPassword" type="password" autocomplete="new-password" placeholder="Password">
        <input class="settings-password" id="backupPasswordAgain" type="password" autocomplete="new-password" placeholder="Repeat password">
        <div class="backup-error" id="backupError" hidden></div>
        <button class="backup-modal-action" id="backupPasswordAction" type="button">EXPORT</button>
      </section>
    </div>

    ${nav('you')}
  </main>`;

  document.getElementById('backupBack').onclick=()=>{state.screen='you';render()};
  const modal=document.getElementById('backupPasswordModal');
  const backdrop=document.getElementById('backupPasswordBackdrop');
  const close=document.getElementById('backupPasswordClose');
  const password=document.getElementById('backupPassword');
  const again=document.getElementById('backupPasswordAgain');
  const action=document.getElementById('backupPasswordAction');
  const title=document.getElementById('backupPasswordTitle');
  const copy=document.getElementById('backupPasswordCopy');
  const error=document.getElementById('backupError');
  const fileInput=document.getElementById('backupFileInput');
  let mode='export',restoreFile=null;

  const closeModal=()=>{
    modal.hidden=true;document.body.classList.remove('modal-open');
    password.value='';again.value='';error.hidden=true;error.textContent='';restoreFile=null;
  };
  const openExport=()=>{
    mode='export';
    title.textContent='Choose a password';
    copy.textContent='You’ll need this password to restore the backup. Body Count cannot recover it for you.';
    again.hidden=false;again.value='';
    action.textContent='EXPORT';
    password.autocomplete='new-password';
    modal.hidden=false;document.body.classList.add('modal-open');
    setTimeout(()=>password.focus(),80);
  };
  const openRestore=file=>{
    mode='restore';restoreFile=file;
    title.textContent='Enter backup password';
    copy.textContent='Restoring will replace the Body Count data currently stored on this device.';
    again.hidden=true;
    action.textContent='RESTORE';
    password.autocomplete='current-password';
    modal.hidden=false;document.body.classList.add('modal-open');
    setTimeout(()=>password.focus(),80);
  };
  document.getElementById('exportBackup').onclick=openExport;
  document.getElementById('restoreBackup').onclick=()=>fileInput.click();
  fileInput.onchange=()=>{
    const file=fileInput.files?.[0];
    fileInput.value='';
    if(file)openRestore(file);
  };
  backdrop.onclick=closeModal;close.onclick=closeModal;

  action.onclick=async()=>{
    error.hidden=true;error.textContent='';
    const pw=password.value;
    if(!pw){error.textContent='Enter a password.';error.hidden=false;return}
    if(mode==='export'){
      if(pw.length<12){error.textContent='Use at least 12 characters.';error.hidden=false;return}
      if(pw!==again.value){error.textContent='The passwords do not match.';error.hidden=false;return}
      action.disabled=true;action.textContent='ENCRYPTING…';
      try{
        const backup=await makeEncryptedBackup(pw);
        const blob=new Blob([JSON.stringify(backup)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        const stamp=new Date().toISOString().slice(0,10);
        a.href=url;a.download=`body-count-${stamp}.bodycount`;
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        closeModal();
      }catch(err){
        error.textContent='The backup could not be created.';error.hidden=false;
      }finally{
        action.disabled=false;action.textContent='EXPORT';
      }
    }else{
      action.disabled=true;action.textContent='RESTORING…';
      try{
        const payload=await decryptBackupFile(restoreFile,pw);
        await replaceAllData(payload);
        clearPhotoUrls();
        closeModal();
        alert('Backup restored.');
        state.screen='you';render();
      }catch(err){
        error.textContent='Could not restore this backup. Check the file and password.';error.hidden=false;
      }finally{
        action.disabled=false;action.textContent='RESTORE';
      }
    }
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
      <h1>${mode==='existing'?'ADD ENCOUNTER':'ADD SOMEONE'}</h1>
      <span aria-hidden="true"></span>
    </div>

    ${mode==='new' ? `
      <div class="quick-field">
        <input class="quick-input" id="name" placeholder="Name / nick" value="${esc(state.quick.name||'')}" autocomplete="off">
      </div>
      <button class="quick-mode-link" id="existingLink">Already in your count?</button>

      <div class="quick-field mental-note-field">
        <div class="quick-memory-block">
          <label class="quick-memory-label" for="memory">MEMORY CUE</label>
          <div class="quick-memory-field">
            <textarea id="memory" aria-label="Memory cue">${esc(state.quick.memory||'')}</textarea>
            <div class="quick-memory-placeholder" id="quickMemoryPlaceholder">
              <div class="quick-memory-primary">One thing you’ll remember him by…</div>
              <div class="quick-memory-secondary">You can add more details later.</div>
            </div>
          </div>
        </div>
      </div>
    ` : `
      <div class="quick-existing-head">
        <span>Who?</span>
        <button class="quick-mode-link" id="newLink">New guy instead</button>
      </div>

      <div class="people-search quick-existing-search">
        <input id="existingSearch" type="search" placeholder="Find someone…" autocomplete="off" value="${selected?esc(displayName(selected)):''}">
      </div>

      <div id="existingResults" class="people-picker quick-picker quick-existing-results"></div>

      ${selected?`<div class="quick-selected-person">
        <span>Selected</span>
        <strong>${esc(displayName(selected))}</strong>
      </div>`:''}
    `}

    <button class="primary quick-save" id="save" ${mode==='existing'&&!selected?'disabled':''}>${mode==='existing'?'ADD ENCOUNTER':'ADD'}</button>
  </section>`;

  document.getElementById('back').onclick=()=>{state.screen='home';render()};

  const memoryField=document.getElementById('memory');
  const quickMemoryPlaceholder=document.getElementById('quickMemoryPlaceholder');
  const syncQuickMemoryPlaceholder=()=>{
    if(quickMemoryPlaceholder) quickMemoryPlaceholder.hidden=Boolean((memoryField?.value||'').length);
  };
  syncQuickMemoryPlaceholder();
  memoryField?.addEventListener('input',syncQuickMemoryPlaceholder);

  document.getElementById('existingLink')?.addEventListener('click',()=>{
    state.quick={
      name:document.getElementById('name')?.value||'',
      memory:document.getElementById('memory')?.value||'',
      mode:'existing'
    };
    renderAdd();
  });

  document.getElementById('newLink')?.addEventListener('click',()=>{
    state.quick={
      name:state.quick.name||'',
      memory:state.quick.memory||'',
      mode:'new'
    };
    delete state.quick.personId;
    renderAdd();
  });

  if(mode==='existing'){
    const search=document.getElementById('existingSearch');
    const results=document.getElementById('existingResults');

    const drawResults=()=>{
      const q=(search.value||'').trim().toLowerCase();
      if(!q){
        results.innerHTML='';
        return;
      }
      const matches=people.filter(p=>{
        const hay=`${displayName(p)} ${p.lastMemory||''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0,12);

      results.innerHTML=matches.length
        ? matches.map(p=>`<button class="pick-person ${selected?.id===p.id?'on':''}" data-pick-person="${p.id}" type="button">
            <b>${esc(displayName(p))}</b>
            ${p.lastMemory?`<span>${esc(p.lastMemory)}</span>`:''}
          </button>`).join('')
        : `<div class="quick-empty">No matches.</div>`;

      results.querySelectorAll('[data-pick-person]').forEach(b=>b.onclick=()=>{
        state.quick.personId=Number(b.dataset.pickPerson);
        renderAdd();
      });
    };

    search.addEventListener('input',()=>{
      if(selected && search.value!==displayName(selected)){
        delete state.quick.personId;
        document.getElementById('save').disabled=true;
      }
      drawResults();
    });

    if(selected) drawResults();
  }

  document.getElementById('save').onclick=saveQuick;
}

async function saveQuick(){
  const mode=state.quick.mode||'new';

  if(mode==='existing'){
    const personId=state.quick.personId;
    if(!personId) return;
    const encounterId=await add('encounters',{
      personId,
      date:new Date().toISOString(),
      memory:'',
      rating:0,
      position:[],
      happened:[],
      health:[],
      notes:''
    });
    state.selectedPersonId=personId;
    state.selectedEncounterId=encounterId;
    state.detailsReturn='person';
    state.screen='encounterEdit';
    render();
    return;
  }

  const memory=(document.getElementById('memory')?.value||'').trim();
  const name=(document.getElementById('name')?.value||'').trim();
  const peopleBefore=await all('people');
  const anonymousNumber=name ? null : peopleBefore.length+1;
  const personId=await add('people',{name,anonymousNumber,createdAt:new Date().toISOString(),about:{}});
  const encounterId=await add('encounters',{
    personId,
    date:new Date().toISOString(),
    memory,
    rating:0,
    position:[],
    happened:[],
    health:[],
    notes:''
  });
  const p=await get('people',personId);
  if(memory){p.lastMemory=memory;await put('people',p)}
  state.selectedPersonId=personId;
  state.selectedEncounterId=encounterId;
  state.lastAddMode=mode;
  state.detailsReturn='postadd';
  state.screen='postadd';
  render();
}

function detailTiles(){return [['position','↕','Position','Top, bottom, vers…'],['happened','✦','What happened','Keep it brief or detailed'],['health','＋','Health','Protection & context'],['about','◌','About him','Age, height, notes'],['anatomy','◇','The details','Private extras']];}
async function renderPostAdd(){
  const firstEncounter=await ensureFirstEncounter(state.selectedPersonId);
  state.selectedEncounterId=firstEncounter.id;
  app.innerHTML=`<main class="postadd-next"><div class="postadd-next-inner">
    <div class="postadd-added" id="postaddAdded">Added to your count</div>
    <div class="postadd-actions">
      <button class="postadd-action-card" id="aboutChoice"><span class="postadd-action-copy"><strong>MORE ABOUT HIM</strong></span><span class="postadd-plus-right">+</span></button>
      <button class="postadd-action-card" id="encounterChoice"><span class="postadd-action-copy"><strong>MORE ABOUT WHAT HAPPENED</strong></span><span class="postadd-plus-right">+</span></button>
    </div>
    <button class="postadd-thatsit" id="done">I’M DONE ADDING</button>
  </div></main>`;
  requestAnimationFrame(()=>{const x=document.getElementById('postaddAdded');setTimeout(()=>x?.classList.add('show'),30);setTimeout(()=>x?.classList.add('hide'),1800)});
  aboutChoice.onclick=()=>{state.screen='about';render()};
  encounterChoice.onclick=()=>{state.detailsReturn='postadd';state.screen='encounterEdit';render()};
  done.onclick=()=>{state.collectionHighlight=state.selectedPersonId;state.screen='collection';render()};
}

async function renderAboutHim(){
  const p=await get('people',state.selectedPersonId);
  if(!p){state.screen='home';return render()}
  const photoRecord=await personPhoto(p.id);
  const photoUrl=photoObjectUrl(photoRecord);
  p.about ||= {};
  const a=p.about;

  const hasPrivateValue=obj=>Object.values(obj||{}).some(v=>
    typeof v==='string' ? v.trim().length>0 :
    typeof v==='boolean' ? v :
    Array.isArray(v) ? v.length>0 :
    v!==null && v!==undefined && v!==''
  );
  const hasPenisDetails=hasPrivateValue(a.penis);
  const hasPeachDetails=hasPrivateValue(a.peach);
  const hasDropsDetails=hasPrivateValue(a.drops);

  const ageBand=a.ageBand||'';
  const heightBand=a.heightBand||'';
  const build=(Array.isArray(a.build)&&a.build[0])||a.buildVisual||'';
  const type=(Array.isArray(a.types)&&a.types[0])||a.type||'';
  const ethnicity=a.ethnicity||'';

  const ageBands=[['young','Young'],['30s','30s'],['middle','Middle age'],['older','Older']];
  const heightBands=[['short','Short'],['medium','Medium'],['tall','Tall']];
  const builds=[['slim','Slim'],['average','Average'],['athletic','Athletic'],['big','Big']];
  const types=[['twink','Twink'],['bear','Bear'],['daddy','Daddy'],['otter','Otter'],['regular','Regular'],['jock','Jock'],['twunk','Twunk'],['other','Other']];
  const ethnicities=[['white','White'],['black','Black'],['asian','Asian'],['mixed','Mixed']];

  app.innerHTML=`<main class="about-minimal">
    <div class="about-minimal-top">
      <button class="about-back" id="back">‹</button>
      <div>ABOUT HIM</div>
      <span></span>
    </div>

    <section class="about-minimal-section about-photo-section">
      ${photoUrl?`
        <button class="about-photo-preview" id="aboutPhotoPreview" type="button" aria-label="View photo">
          <img src="${photoUrl}" alt="">
        </button>
        <div class="about-photo-actions">
          <button id="replacePhoto" type="button">REPLACE</button>
          <button id="removePhoto" type="button">REMOVE</button>
        </div>
      `:`
        <button class="about-photo-empty" id="addPhoto" type="button">
          <span class="about-photo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 6.5h3l1.3-2h7.4l1.3 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.7"/></svg>
          </span>
          <span>ADD PHOTO OR SCREENSHOT</span>
        </button>
      `}
      <div class="about-photo-privacy">Stored only on this device.</div>
      <input id="photoInput" class="photo-file-input" type="file" accept="image/*">
    </section>

    <section class="about-minimal-section">
      <div class="about-minimal-label">AGE</div>
      <div class="about-minimal-options four">
        ${ageBands.map(([k,l])=>`<button data-age-band="${k}" class="${ageBand===k?'on':''}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="about-minimal-section">
      <div class="about-minimal-label">HEIGHT</div>
      <div class="about-minimal-options three">
        ${heightBands.map(([k,l])=>`<button data-height-band="${k}" class="${heightBand===k?'on':''}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="about-minimal-section">
      <div class="about-minimal-label">BUILD</div>
      <div class="about-minimal-options four">
        ${builds.map(([k,l])=>`<button data-build="${k}" class="${build===k?'on':''}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="about-minimal-section">
      <div class="about-minimal-label">TYPE</div>
      <div class="about-minimal-options four">
        ${types.map(([k,l])=>`<button data-type="${k}" class="${type===k?'on':''}">${l}</button>`).join('')}
      </div>
      ${type==='other'?`<input id="typeOtherText" class="about-custom-input" type="text" maxlength="60" placeholder="Type your own…" value="${esc(a.typeOther||'')}">`:''}
    </section>

    <section class="about-minimal-section">
      <div class="about-minimal-label">ETHNICITY</div>
      <div class="about-minimal-options four">
        ${ethnicities.map(([k,l])=>`<button data-ethnicity="${k}" class="${ethnicity===k?'on':''}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="about-minimal-section spicy-details-section">
      <div class="about-minimal-label">SPICY DETAILS</div>
      <div class="about-symbols persistent-symbols about-minimal-symbols">
        <button class="about-symbol art-symbol spicy-egg ${hasPenisDetails?'has-data':''}" data-subopen="egg"><img src="assets/detail-eggplant.png?v=109" alt=""></button>
        <button class="about-symbol art-symbol spicy-peach ${hasPeachDetails?'has-data':''}" data-subopen="peach"><img src="assets/detail-peach.png?v=109" alt=""></button>
        <button class="about-symbol art-symbol spicy-drops ${hasDropsDetails?'has-data':''}" data-subopen="drop"><img src="assets/detail-drops.png?v=117" alt=""></button>
      </div>
    </section>

    <button class="about-done-wide" id="aboutDone" type="button">DONE</button>

    ${photoUrl?`<div class="photo-viewer" id="photoViewer" hidden>
      <button class="photo-viewer-backdrop" id="photoViewerBackdrop" type="button" aria-label="Close"></button>
      <div class="photo-viewer-stage">
        <img src="${photoUrl}" alt="">
        <button class="photo-viewer-close" id="photoViewerClose" type="button" aria-label="Close">×</button>
      </div>
    </div>`:''}
  </main>`;

  const persist=async()=>{
    const current=await get('people',state.selectedPersonId);
    current.about={...(current.about||{}),...(p.about||{})};
    await put('people',current);
  };

  const bindChoice=(selector,apply)=>{
    document.querySelectorAll(selector).forEach(b=>b.onclick=async()=>{
      const wasOn=b.classList.contains('on');
      apply(wasOn ? null : b);
      document.querySelectorAll(selector).forEach(x=>x.classList.remove('on'));
      if(!wasOn)b.classList.add('on');
      await persist();
    });
  };

  bindChoice('[data-age-band]',b=>{
    if(b)p.about.ageBand=b.dataset.ageBand;
    else delete p.about.ageBand;
  });
  bindChoice('[data-height-band]',b=>{
    if(b)p.about.heightBand=b.dataset.heightBand;
    else delete p.about.heightBand;
  });
  bindChoice('[data-build]',b=>{
    if(b){p.about.build=[b.dataset.build];p.about.buildVisual=b.dataset.build}
    else{delete p.about.build;delete p.about.buildVisual}
  });
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=async()=>{
    const value=b.dataset.type;
    const wasOn=type===value;
    if(wasOn){
      delete p.about.types;
      delete p.about.type;
      if(value==='other') delete p.about.typeOther;
    }else{
      p.about.types=[value];
      p.about.type=value;
      if(value!=='other') delete p.about.typeOther;
    }
    await persist();
    renderAboutHim();
  });

  bindChoice('[data-ethnicity]',b=>{
    if(b)p.about.ethnicity=b.dataset.ethnicity;
    else delete p.about.ethnicity;
  });

  const typeOtherText=document.getElementById('typeOtherText');
  if(typeOtherText) typeOtherText.oninput=async()=>{
    p.about.typeOther=typeOtherText.value;
    await persist();
  };


  const photoInput=document.getElementById('photoInput');
  const openPicker=()=>photoInput.click();
  const addPhotoButton=document.getElementById('addPhoto');
  const replacePhotoButton=document.getElementById('replacePhoto');
  if(addPhotoButton)addPhotoButton.onclick=openPicker;
  if(replacePhotoButton)replacePhotoButton.onclick=openPicker;
  photoInput.onchange=async()=>{
    const file=photoInput.files?.[0];
    if(!file)return;
    try{
      await savePersonPhoto(p.id,file);
      renderAboutHim();
    }catch(e){
      alert('That image could not be added.');
    }
  };
  const removePhotoButton=document.getElementById('removePhoto');
  if(removePhotoButton)removePhotoButton.onclick=async()=>{
    await remove('photos',p.id);
    renderAboutHim();
  };
  if(photoUrl){
    const viewer=document.getElementById('photoViewer');
    const openViewer=()=>{viewer.hidden=false;document.body.classList.add('modal-open')};
    const closeViewer=()=>{viewer.hidden=true;document.body.classList.remove('modal-open')};
    document.getElementById('aboutPhotoPreview').onclick=openViewer;
    document.getElementById('photoViewerBackdrop').onclick=closeViewer;
    document.getElementById('photoViewerClose').onclick=closeViewer;
  }

  document.getElementById('back').onclick=async()=>{
    await persist();
    state.screen=state.detailsReturn==='person'?'person':'postadd';
    render();
  };

  document.getElementById('aboutDone').onclick=async()=>{
    await persist();
    state.screen=state.detailsReturn==='person'?'person':'postadd';
    render();
  };

  document.querySelector('.persistent-symbols').onclick=e=>{
    const b=e.target.closest('[data-subopen]');
    if(!b)return;
    const target={egg:'penis',peach:'peach',drop:'drops'}[b.dataset.subopen];
    if(target){
      state.screen=target;
      render();
    }
  };
}
async function renderPenis(){
  const p=await get('people',state.selectedPersonId);
  p.about ||= {};
  p.about.penis ||= {};
  const d=p.about.penis;
  if(d.girth==='Massive') d.girth='Thick';
  if('veins' in d) delete d.veins;
  if(!d.curveVertical && ['Curved up','Straight','Curved down'].includes(d.curve)) d.curveVertical=d.curve;
  if(d.curve==='Sideways' && !d.sideways) d.sideways=true;


  const row=(label,key,items,extra='')=>`<section class="detail-block compact-choice-block">
    <div class="detail-label">${label}</div>
    <div class="detail-pills ${items.length===5?'five':items.length===4?'four':items.length===3?'three':'two'} ${extra}">
      ${items.map(([v,t])=>`<button data-penis-key="${key}" data-penis-value="${v}" class="${d[key]===v?'on':''}">${t}</button>`).join('')}
    </div>
  </section>`;

  app.innerHTML=`<main class="private-detail-screen compact-choice-screen penis-screen">
    <div class="about-top compact-detail-top"><button class="about-back" id="backPenis">‹</button><div></div><span></span></div>
    <nav class="private-tabs">
      <button class="on" data-go-private="penis"><img src="assets/detail-eggplant.png?v=109" alt=""></button>
      <button class="" data-go-private="peach"><img src="assets/detail-peach.png?v=109" alt=""></button>
      <button class="" data-go-private="drops"><img src="assets/detail-drops.png?v=117" alt=""></button>
    </nav>

    ${row('SIZE','size',[['S','S'],['M','M'],['L','L'],['XL','XL'],['XXL','XXL']])}
    ${row('GIRTH','girth',[['Slim','Slim'],['Average','Average'],['Thick','Thick']])}
    ${row('FORESKIN','foreskin',[['Cut','Cut'],['Uncut','Uncut']])}

    <section class="detail-block compact-choice-block">
      <div class="detail-label">SHAPE</div>

      <div class="detail-pills three">
        ${['Curved up','Straight','Curved down'].map(v=>`<button data-penis-key="curveVertical" data-penis-value="${v}" class="${d.curveVertical===v?'on':''}">${v}</button>`).join('')}
      </div>

      <div class="detail-pills one subchoice-row">
        <button data-penis-key="sideways" data-penis-value="Sideways" class="${d.sideways?'on':''}">Sideways</button>
      </div>

      ${d.sideways?`<div class="detail-pills two subchoice-row">
        ${['Left','Right'].map(v=>`<button data-penis-key="curveSide" data-penis-value="${v}" class="${d.curveSide===v?'on':''}">${v}</button>`).join('')}
      </div>`:''}
    </section><section class="detail-block private-note-block"><div class="detail-label">ANYTHING ELSE?</div><textarea id="penisNote" class="private-note" placeholder="">${esc(d.note||'')}</textarea></section>
    <button class="flow-done" id="donePenis">DONE</button>
  </main>`;

  const save=async()=>{
    const c=await get('people',state.selectedPersonId);
    c.about ||= {};
    c.about.penis={...d};
    await put('people',c);
  };

  document.querySelectorAll('[data-go-private]').forEach(b=>b.onclick=async()=>{
    await save();
    state.screen=b.dataset.goPrivate;
    render();
  });

  document.getElementById('backPenis').onclick=async()=>{
    await save();
    state.screen='about';
    render();
  };
  document.getElementById('donePenis').onclick=async()=>{await save();state.screen='about';render();};

  document.querySelectorAll('[data-penis-key]').forEach(b=>b.onclick=async()=>{
    const key=b.dataset.penisKey;
    const val=b.dataset.penisValue;

    if(key==='sideways'){
      d.sideways=!d.sideways;
      if(!d.sideways) d.curveSide='';
      await save();
      renderPenis();
      return;
    }

    d[key]=d[key]===val?'':val;
    await save();
    renderPenis();
  });
  const pn=document.getElementById('penisNote');if(pn)pn.oninput=async()=>{d.note=pn.value;await save();};
}

async function renderPeach(){
  const p=await get('people',state.selectedPersonId);
  p.about ||= {}; p.about.peach ||= {};
  const d=p.about.peach;

  const row=(label,key,items)=>`<section class="detail-block compact-choice-block">
    <div class="detail-label">${label}</div>
    <div class="detail-pills ${items.length===3?'three':'four'}">
      ${items.map(([v,t])=>`<button data-peach-key="${key}" data-peach-value="${v}" class="${d[key]===v?'on':''}">${t}</button>`).join('')}
    </div>
  </section>`;

  app.innerHTML=`<main class="private-detail-screen compact-choice-screen">
    <div class="about-top compact-detail-top"><button class="about-back" id="backPeach">‹</button><div></div><span></span></div><nav class="private-tabs">
      <button class="" data-go-private="penis"><img src="assets/detail-eggplant.png?v=109" alt=""></button>
      <button class="on" data-go-private="peach"><img src="assets/detail-peach.png?v=109" alt=""></button>
      <button class="" data-go-private="drops"><img src="assets/detail-drops.png?v=117" alt=""></button>
    </nav>
${row('SIZE','size',[['small','Small'],['average','Average'],['big','Big']])}
    ${row('SHAPE','shape',[['flat','Flat'],['round','Round'],['bubble','Bubble'],['wide','Wide']])}
    ${row('FIRMNESS','firmness',[['soft','Soft'],['medium','Medium'],['firm','Firm']])}
    ${row('HAIR','hair',[['smooth','Smooth'],['trimmed','Trimmed'],['natural','Natural'],['hairy','Hairy']])}
  <section class="detail-block private-note-block"><div class="detail-label">ANYTHING ELSE?</div><textarea id="peachNote" class="private-note" placeholder="">${esc(d.note||"")}</textarea></section>
  <button class="flow-done" id="donePeach">DONE</button></main>`;

  const save=async()=>{const c=await get('people',state.selectedPersonId);c.about||={};c.about.peach={...d};await put('people',c)};
    document.querySelectorAll('[data-go-private]').forEach(b=>b.onclick=async()=>{await save();state.screen=b.dataset.goPrivate;render();});
document.getElementById('backPeach').onclick=async()=>{await save();state.screen='about';render()};
document.getElementById('donePeach').onclick=async()=>{await save();state.screen='about';render();};
  document.querySelectorAll('[data-peach-key]').forEach(b=>b.onclick=async()=>{
    const key=b.dataset.peachKey,val=b.dataset.peachValue;
    d[key]=val;
    document.querySelectorAll(`[data-peach-key="${key}"]`).forEach(x=>x.classList.toggle('on',x===b));
    await save();
  });
 const nn=document.getElementById('peachNote');if(nn)nn.oninput=async()=>{d.note=nn.value;const c=await get('people',state.selectedPersonId);c.about||={};c.about.peach={...d};await put('people',c);};
}

async function renderDrops(){
  const p=await get('people',state.selectedPersonId);
  p.about ||= {}; p.about.drops ||= {};
  const d=p.about.drops;

  const sideDrop=(scale=1,rot=-34)=>`
    <svg viewBox="0 0 34 24" aria-hidden="true" style="transform:rotate(${rot}deg) scale(${scale})">
      <path d="M3 12C8 8 13 4 22 3c-1 7-4 12-9 15-4 2-8 1-10-2-1-1-1-3 0-4Z"/>
    </svg>`;

  const loadMark=(count)=>{
    const configs = count===1
      ? [[1, -34]]
      : count===3
        ? [[.88,-42],[1,-28],[.78,-12]]
        : [[.72,-50],[.88,-40],[1,-28],[.84,-16],[.66,-4]];
    return `<span class="side-drop-mark">${configs.map(([s,r])=>sideDrop(s,r)).join('')}</span>`;
  };

  app.innerHTML=`<main class="private-detail-screen detail-natural drops-screen">
    <div class="about-top compact-detail-top"><button class="about-back" id="backDrops">‹</button><div></div><span></span></div><nav class="private-tabs">
      <button class="" data-go-private="penis"><img src="assets/detail-eggplant.png?v=109" alt=""></button>
      <button class="" data-go-private="peach"><img src="assets/detail-peach.png?v=109" alt=""></button>
      <button class="on" data-go-private="drops"><img src="assets/detail-drops.png?v=117" alt=""></button>
    </nav>
<section class="detail-block drops-block">
      <div class="detail-label">LOAD</div>
      <div class="detail-pills three load-text-options">
        <button data-amount="low" class="${d.amount==='low'?'on':''}">Small</button>
        <button data-amount="medium" class="${d.amount==='medium'?'on':''}">Medium</button>
        <button data-amount="high" class="${d.amount==='high'?'on':''}">Large</button>
      </div>
    </section>

    <section class="detail-block distance-block">
      <div class="detail-label">SHOT</div>
      <div class="shot-options">
        <button data-distance="flow" class="${d.distance==='flow'?'on':''}">Flow</button>
        <button data-distance="short" class="${d.distance==='short'?'on':''}">Medium Distance</button>
        <button data-distance="long" class="${d.distance==='long'?'on':''}">Long shot</button>
      </div>
    </section>
  <section class="detail-block private-note-block"><div class="detail-label">ANYTHING ELSE?</div><textarea id="dropsNote" class="private-note" placeholder="">${esc(d.note||"")}</textarea></section>
  <button class="flow-done" id="doneDrops">DONE</button></main>`;

  const save=async()=>{const c=await get('people',state.selectedPersonId);c.about||={};c.about.drops={...d};await put('people',c)};
    document.querySelectorAll('[data-go-private]').forEach(b=>b.onclick=async()=>{await save();state.screen=b.dataset.goPrivate;render();});
document.getElementById('backDrops').onclick=async()=>{await save();state.screen='about';render()};
document.getElementById('doneDrops').onclick=async()=>{await save();state.screen='about';render();};
  document.querySelectorAll('[data-amount]').forEach(b=>b.onclick=async()=>{
    d.amount=b.dataset.amount;
    document.querySelectorAll('[data-amount]').forEach(x=>x.classList.toggle('on',x===b));
    await save();
  });
  document.querySelectorAll('[data-distance]').forEach(b=>b.onclick=async()=>{
    d.distance=b.dataset.distance;
    document.querySelectorAll('[data-distance]').forEach(x=>x.classList.toggle('on',x===b));
    await save();
  });
 const nn=document.getElementById('dropsNote');if(nn)nn.oninput=async()=>{d.note=nn.value;const c=await get('people',state.selectedPersonId);c.about||={};c.about.drops={...d};await put('people',c);};
}


async function renderEncounterEdit(){
  let e=state.selectedEncounterId?await get('encounters',state.selectedEncounterId):await ensureFirstEncounter(state.selectedPersonId);
  if(!e) e=await ensureFirstEncounter(state.selectedPersonId);
  state.selectedEncounterId=e.id;

  e.happened ||= [];
  e.happenedDetails ||= {};
  e.protection ||= [];
  e.when ||= {precision:'exact',date:e.date||new Date().toISOString().slice(0,10)};

  // v10.9 vocabulary migration: keep existing records, but surface them as Blowjob/Fucking.
  const renameActivity=(from,to)=>{
    if(e.happened.includes(from) && !e.happened.includes(to)) e.happened.push(to);
    e.happened=e.happened.filter(x=>x!==from);
    if(e.happenedDetails[from]!==undefined && e.happenedDetails[to]===undefined) e.happenedDetails[to]=e.happenedDetails[from];
    delete e.happenedDetails[from];
  };
  renameActivity('Oral','Blowjob');
  renameActivity('Fucking','Anal');

  // Compatibility with older single-string details.
  const normalize=(a)=>{
    const old=e.happenedDetails[a];
    if(Array.isArray(old)) return;
    if(!old){e.happenedDetails[a]=[];return;}
    const map={
      Handjob:{'Both':['I jerked him off','He jerked me off'],'I jerked him off':['I jerked him off'],'He jerked me off':['He jerked me off']},
      Blowjob:{'69':['I sucked','He blew me'],'I sucked':['I sucked'],'He sucked':['He blew me'],'He blew me':['He blew me']},
      Anal:{'We switched':['I fucked him','He fucked me'],'switch':['I fucked him','He fucked me'],'I topped':['I fucked him'],'I bottomed':['He fucked me'],'He topped':['He fucked me'],'I fucked him':['I fucked him'],'He fucked me':['He fucked me']}
    };
    e.happenedDetails[a]=(map[a]&&map[a][old])||[old];
  };
  ['Handjob','Blowjob','Anal'].forEach(normalize);

  // Normalize legacy array labels too.
  if(Array.isArray(e.happenedDetails.Blowjob)){
    e.happenedDetails.Blowjob=e.happenedDetails.Blowjob.map(v=>v==='He sucked'?'He blew me':v);
  }
  if(Array.isArray(e.happenedDetails.Anal)){
    e.happenedDetails.Anal=e.happenedDetails.Anal.map(v=>v==='I topped'?'I fucked him':v==='He topped'||v==='I bottomed'?'He fucked me':v);
  }

  const now=new Date();
  const rawBaseDate=String(e.when.date||e.date||now.toISOString()).slice(0,10);
  const base=new Date(`${rawBaseDate}T12:00:00`);
  const curYear=Number(e.when.year)||base.getFullYear()||now.getFullYear();
  const curMonth=Number(e.when.month)||base.getMonth()+1||now.getMonth()+1;
  const calendarDaysInMonth=(year,month)=>new Date(Number(year),Number(month),0).getDate();
  const maxDay=calendarDaysInMonth(curYear,curMonth);
  const curDay=Math.min(Number(e.when.day)||base.getDate(),maxDay);
  const precision=e.when.precision||'exact';
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const seasons=['SPRING','SUMMER','AUTUMN','WINTER'];
  const years=Array.from({length:80},(_,i)=>now.getFullYear()-i);
  const days=Array.from({length:maxDay},(_,i)=>i+1);

  const has=a=>e.happened.includes(a);
  const detailOptions={
    Handjob:['I jerked him off','He jerked me off'],
    Blowjob:['I sucked','He blew me'],
    Anal:['I fucked him','He fucked me']
  };

  const activityCard=a=>{
    const details=e.happenedDetails[a]||[];
    return `<div class="activity-unit">
      <button class="activity-tile ${has(a)?'on':''}" data-act="${a}">${a.toUpperCase()}</button>
      ${has(a)?`<div class="activity-subrow">
        ${detailOptions[a].map(v=>`<button class="activity-sub ${details.includes(v)?'on':''}" data-da="${a}" data-dv="${v}">${v}</button>`).join('')}
      </div>`:''}
    </div>`;
  };

  const wheel=(id,values,current,label=v=>v)=>`
    <div class="bc-wheel" id="${id}" data-wheel="${id}">
      <div class="bc-wheel-highlight"></div>
      <div class="bc-wheel-list">
        ${values.map(v=>`<button class="bc-wheel-item ${String(v)===String(current)?'selected':''}" data-value="${v}">${label(v)}</button>`).join('')}
      </div>
    </div>`;

  let whenControl='';
  if(precision==='exact'){
    whenControl=`<div class="wheel-row wheel-three">
      ${wheel('wDay',days,curDay)}
      ${wheel('wMonth',Array.from({length:12},(_,i)=>i+1),curMonth,v=>months[v-1])}
      ${wheel('wYear',years,curYear)}
    </div>`;
  }else if(precision==='month'){
    whenControl=`<div class="wheel-row wheel-two">
      ${wheel('wMonth',Array.from({length:12},(_,i)=>i+1),curMonth,v=>months[v-1])}
      ${wheel('wYear',years,curYear)}
    </div>`;
  }else if(precision==='season'){
    whenControl=`<div class="wheel-row wheel-two">
      ${wheel('wSeason',seasons,e.when.season||'SUMMER')}
      ${wheel('wYear',years,curYear)}
    </div>`;
  }else if(precision==='year'){
    whenControl=`<div class="wheel-row wheel-one">${wheel('wYear',years,curYear)}</div>`;
  }else if(precision==='range'){
    const from=Number(e.when.from)||curYear;
    const rawTo=Number(e.when.to)||Math.min(now.getFullYear(),from+1);
    const to=Math.max(from,rawTo);
    const toYears=years.filter(y=>y>=from);
    whenControl=`<div class="wheel-range">
      ${wheel('wFrom',years,from)}
      <span class="range-dash">—</span>
      ${wheel('wTo',toYears,to)}
    </div>`;
  }

  app.innerHTML=`<main class="encounter-editor screen-enter">
    <div class="encounter-top">
      <button class="about-back" id="encBack">‹</button>
      <div class="encounter-title">ENCOUNTER</div>
      <button class="note-icon-button encounter-note-button ${String(e.privateNote||'').trim()?'has-note':''}" id="encNoteButton" type="button" aria-label="Private note">
        ${noteIconMarkup()}<span class="note-dot"></span>
      </button>
    </div>

    <section class="enc-section">
      <div class="enc-section-title">WHAT HAPPENED</div>
      <div class="activity-grid">
        ${activityCard('Handjob')}
        ${activityCard('Blowjob')}
        ${activityCard('Anal')}
      </div>

      <div class="other-unit">
        <button class="other-tile ${has('Other')?'on':''}" data-act="Other">MORE</button>
        ${has('Other')?`<input class="enc-other" id="otherText" placeholder="What else?" value="${esc(e.other||'')}">`:''}
      </div>
    </section>

    <section class="enc-section">
      <div class="enc-section-title">PROTECTION</div>
      <div class="protection-grid">
        ${['Condom','PrEP','Doxy-PEP','U=U'].map(v=>`<button class="protection-chip ${e.protection.includes(v)?'on':''}" data-protection="${v}">${v.toUpperCase()}</button>`).join('')}
      </div>
    </section>

    <section class="enc-section when-section">
      <div class="enc-section-title">WHEN</div>
      <div class="precision-chips">
        ${[['exact','Exact'],['month','Month'],['season','Season'],['year','Year'],['range','Range']].map(([v,t])=>`<button class="${precision===v?'on':''}" data-prec="${v}">${t}</button>`).join('')}
      </div>
      ${whenControl}
      ${precision!=='exact'?`<label class="multiple-encounters-row">
        <input id="multipleEncounters" type="checkbox" ${e.when.multipleEncounters?'checked':''}>
        <span class="multiple-encounters-box" aria-hidden="true"></span>
        <span>MULTIPLE ENCOUNTERS</span>
      </label>`:''}
    </section>

    <section class="enc-section how-section">
      <div class="enc-section-title">HOW WAS IT</div>
      <div class="enc-stars">
        ${[1,2,3,4,5].map(n=>`<button type="button" data-rate="${n}" aria-label="${n} star${n===1?'':'s'}" class="${(e.rating||0)>=n?'on':''}">★</button>`).join('')}
      </div>
    </section>
    <button class="flow-done encounter-flow-done" id="encDone">DONE</button>

    <div class="note-modal" id="encNoteModal" hidden>
      <button class="note-modal-backdrop" id="encNoteBackdrop" type="button" aria-label="Close note"></button>
      <section class="note-sheet" role="dialog" aria-modal="true" aria-labelledby="encNoteTitle">
        <div class="note-sheet-head">
          <div>
            <div class="note-sheet-kicker">PRIVATE NOTE</div>
            <h2 id="encNoteTitle">This encounter</h2>
          </div>
          <button class="note-close" id="encNoteClose" type="button" aria-label="Close">×</button>
        </div>
        <textarea class="note-textarea" id="encNoteText" placeholder="">${esc(e.privateNote||'')}</textarea>
        <button class="note-done" id="encNoteDone" type="button">DONE</button>
      </section>
    </div>
  </main>`;

  const save=async()=>{
    if(e.when.precision==='exact'){
      const yy=Number(e.when.year)||curYear;
      const mm=Number(e.when.month)||curMonth;
      const dd=Math.min(Number(e.when.day)||curDay,calendarDaysInMonth(yy,mm));
      e.when.day=dd;e.when.month=mm;e.when.year=yy;
      e.when.date=`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      e.date=e.when.date;
    }
    if(e.when.precision==='range'){
      const from=Number(e.when.from)||curYear;
      const to=Math.max(from,Number(e.when.to)||from);
      e.when.from=from;
      e.when.to=to;
    }
    await put('encounters',e);
  };

  const leaveEncounterEditor=async()=>{
    await save();
    state.screen=state.detailsReturn||'person';
    render();
  };
  document.getElementById('encBack').onclick=leaveEncounterEditor;
  document.getElementById('encDone').onclick=leaveEncounterEditor;

  const encNoteModal=document.getElementById('encNoteModal');
  const encNoteButton=document.getElementById('encNoteButton');
  const encNoteText=document.getElementById('encNoteText');
  const openEncNote=()=>{
    encNoteModal.hidden=false;
    document.body.classList.add('modal-open');
    setTimeout(()=>encNoteText.focus(),80);
  };
  const closeEncNote=()=>{
    encNoteModal.hidden=true;
    document.body.classList.remove('modal-open');
  };
  encNoteButton.onclick=openEncNote;
  document.getElementById('encNoteBackdrop').onclick=closeEncNote;
  document.getElementById('encNoteClose').onclick=closeEncNote;
  document.getElementById('encNoteDone').onclick=closeEncNote;
  encNoteText.oninput=async()=>{
    e.privateNote=encNoteText.value;
    await save();
    encNoteButton.classList.toggle('has-note',!!encNoteText.value.trim());
  };

  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
    const v=b.dataset.act;
    e.happened=has(v)?e.happened.filter(x=>x!==v):[...e.happened,v];
    await save();renderEncounterEdit();
  });

  document.querySelectorAll('[data-da]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.da,v=b.dataset.dv;
    const vals=e.happenedDetails[a]||[];
    e.happenedDetails[a]=vals.includes(v)?vals.filter(x=>x!==v):[...vals,v];
    await save();renderEncounterEdit();
  });

  document.querySelectorAll('[data-protection]').forEach(b=>b.onclick=async()=>{
    const v=b.dataset.protection;
    e.protection=e.protection.includes(v)?e.protection.filter(x=>x!==v):[...e.protection,v];
    await save();renderEncounterEdit();
  });

  document.querySelectorAll('[data-prec]').forEach(b=>b.onclick=async()=>{
    e.when.precision=b.dataset.prec;
    if(e.when.precision==='exact') delete e.when.multipleEncounters;
    await save();renderEncounterEdit();
  });

  const multipleEncounters=document.getElementById('multipleEncounters');
  if(multipleEncounters) multipleEncounters.onchange=async()=>{
    e.when.multipleEncounters=multipleEncounters.checked;
    await save();
  };

  const stars=document.querySelector('.enc-stars');
  if(stars){
    stars.addEventListener('click',async(ev)=>{
      const b=ev.target.closest('[data-rate]');
      if(!b)return;
      ev.preventDefault();
      const n=Number(b.dataset.rate);
      e.rating=e.rating===n?0:n;
      stars.querySelectorAll('[data-rate]').forEach(x=>{
        x.classList.toggle('on',Number(x.dataset.rate)<=e.rating);
      });
      await save();
    });
  }

  const other=document.getElementById('otherText');
  if(other) other.oninput=async()=>{e.other=other.value;await save()};

  const wheelBindings={
    wDay:'day',wMonth:'month',wYear:'year',
    wSeason:'season',wFrom:'from',wTo:'to'
  };

  const itemMarkup=(values,current,label=v=>v)=>
    values.map(v=>`<button class="bc-wheel-item ${String(v)===String(current)?'selected':''}" data-value="${v}">${label(v)}</button>`).join('');

  const refreshWheel=(id,values,current,label=v=>v)=>{
    const root=document.getElementById(id);
    if(!root)return;
    const list=root.querySelector('.bc-wheel-list');
    list.innerHTML=itemMarkup(values,current,label);
    const items=[...list.querySelectorAll('.bc-wheel-item')];
    const idx=Math.max(0,items.findIndex(x=>x.classList.contains('selected')));
    requestAnimationFrame(()=>{list.scrollTop=idx*40});
  };

  Object.entries(wheelBindings).forEach(([id,key])=>{
    const root=document.getElementById(id);
    if(!root)return;
    const list=root.querySelector('.bc-wheel-list');
    const itemHeight=40;
    let timer;

    const getItems=()=>[...root.querySelectorAll('.bc-wheel-item')];
    const initialItems=getItems();
    const current=Math.max(0,initialItems.findIndex(x=>x.classList.contains('selected')));
    requestAnimationFrame(()=>{list.scrollTop=current*itemHeight});

    const commit=async()=>{
      const items=getItems();
      if(!items.length)return;
      const idx=Math.max(0,Math.min(items.length-1,Math.round(list.scrollTop/itemHeight)));
      const value=items[idx].dataset.value;
      const previous=String(e.when[key] ?? '');
      const target=idx*itemHeight;

      if(Math.abs(list.scrollTop-target)>.5){
        list.scrollTo({top:target,behavior:'smooth'});
      }

      e.when[key]=value;
      items.forEach((x,i)=>x.classList.toggle('selected',i===idx));
      await save();

      const actuallyChanged=previous!==String(value);

      /* Update only the dependent wheel, never the whole screen.
         This removes the visible jump/flicker when changing month/year or range start. */
      if(actuallyChanged&&e.when.precision==='exact'&&(key==='month'||key==='year')){
        const yy=Number(e.when.year)||curYear;
        const mm=Number(e.when.month)||curMonth;
        const max=calendarDaysInMonth(yy,mm);
        const day=Math.min(Number(e.when.day)||curDay,max);
        e.when.day=day;
        await save();
        refreshWheel('wDay',Array.from({length:max},(_,i)=>i+1),day);
      }

      if(actuallyChanged&&e.when.precision==='range'&&key==='from'){
        const from=Number(e.when.from)||curYear;
        const allowed=years.filter(y=>y>=from);
        const to=Math.max(from,Number(e.when.to)||from);
        e.when.to=to;
        await save();
        refreshWheel('wTo',allowed,to);
      }
    };

    list.addEventListener('scroll',()=>{
      clearTimeout(timer);
      timer=setTimeout(commit,90);
    },{passive:true});

    list.addEventListener('click',(ev)=>{
      const item=ev.target.closest('.bc-wheel-item');
      if(!item)return;
      const items=getItems();
      const idx=items.indexOf(item);
      if(idx>=0)list.scrollTo({top:idx*itemHeight,behavior:'smooth'});
    });
  });
}

async function renderDetails(){
 const p=await get('people',state.selectedPersonId);
 let e=state.selectedEncounterId?await get('encounters',state.selectedEncounterId):null;
 const tab=state.detailsTab;
 if(!e && ['position','happened','health'].includes(tab)){const es=(await all('encounters')).filter(x=>x.personId===p.id).sort(compareEncountersNewest);e=es[0];state.selectedEncounterId=e?.id||null;}
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
function noteIconMarkup(){
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.75 3.75h7.9l2.6 2.6v13.9H6.75z"></path>
    <path d="M14.5 3.9v2.8h2.8"></path>
    <path d="M9.2 10h5.6M9.2 13h5.6M9.2 16h3.8"></path>
  </svg>`;
}

function personAboutSummary(p){
  const a=p.about||{};
  const vals=[];
  const age={young:'Young','30s':'30s',middle:'Middle age',older:'Older'}[a.ageBand];
  const height={short:'Short',medium:'Medium height',tall:'Tall'}[a.heightBand];
  const br=(Array.isArray(a.build)&&a.build[0])||a.buildVisual||'';
  const build={slim:'Slim',average:'Average',athletic:'Athletic',big:'Big'}[String(br).toLowerCase()];
  const tr=(Array.isArray(a.types)&&a.types[0])||a.type||'';
  const typeMap={twink:'Twink',twunk:'Twunk',bear:'Bear',daddy:'Daddy',otter:'Otter',regular:'Regular',jock:'Jock',cub:'Cub',other:'Other'};
  let type=typeMap[String(tr).toLowerCase()];
  if(String(tr).toLowerCase()==='other' && String(a.typeOther||'').trim()) type=String(a.typeOther).trim();
  const ethnicity={white:'White',black:'Black',asian:'Asian',mixed:'Mixed'}[String(a.ethnicity||'').toLowerCase()];
  [age,height,build,type,ethnicity].filter(Boolean).forEach(x=>vals.push(x));
  return vals;
}

function privateSummary(p){
  const a=p.about||{};
  const out=[];
  const titleCase=s=>s ? String(s).charAt(0).toUpperCase()+String(s).slice(1) : '';

  const penis=a.penis||{};
  const penisBits=[
    penis.size,
    penis.girth,
    penis.foreskin,
    penis.curveVertical,
    penis.sideways ? (penis.curveSide ? `Sideways ${String(penis.curveSide).toLowerCase()}` : 'Sideways') : null
  ].filter(Boolean);
  if(penisBits.length || (penis.note||'').trim()){
    out.push({icon:'assets/detail-eggplant.png?v=109',label:'Penis',bits:penisBits,note:(penis.note||'').trim()});
  }

  const peach=a.peach||{};
  const peachBits=[peach.size,peach.shape,peach.firmness,peach.hair].filter(Boolean).map(titleCase);
  if(peachBits.length || (peach.note||'').trim()){
    out.push({icon:'assets/detail-peach.png?v=109',label:'Ass',bits:peachBits,note:(peach.note||'').trim()});
  }

  const drops=a.drops||{};
  const amount={low:'Small Load',medium:'Medium Load',high:'Big Load'}[drops.amount];
  const distance={flow:'Flow',short:'Medium Distance',long:'Long shot'}[drops.distance];
  const dropBits=[amount,distance].filter(Boolean);
  if(dropBits.length || (drops.note||'').trim()){
    out.push({icon:'assets/detail-drops.png?v=117',label:'Cum',bits:dropBits,note:(drops.note||'').trim()});
  }
  return out;
}

function encounterWhenLabel(e){
  const w=e.when||{};
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  if(w.precision==='month' && w.month && w.year) return `${months[Number(w.month)-1]} ${w.year}`;
  if(w.precision==='season' && w.season && w.year) return `${String(w.season).charAt(0)+String(w.season).slice(1).toLowerCase()} ${w.year}`;
  if(w.precision==='year' && w.year) return String(w.year);
  if(w.precision==='range' && w.from) return `${w.from}${w.to?` — ${w.to}`:''}`;
  const raw=String(w.date||e.date||'').slice(0,10);
  if(raw){
    const d=new Date(`${raw}T12:00:00`);
    if(!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('en-US',{day:'numeric',month:'short',year:'numeric'}).format(d);
  }
  return 'Unknown date';
}


function encounterChronology(e){
  const w=e.when||{};
  const precision=w.precision||'exact';
  const mk=(y,m=1,d=1)=>Date.UTC(Number(y),Number(m)-1,Number(d));
  const yearEnd=y=>mk(y,12,31);
  if(precision==='exact'){
    const raw=String(w.date||e.date||'').slice(0,10);
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){const t=mk(m[1],m[2],m[3]);return {start:t,end:t,specificity:5}}
  }
  if(precision==='month' && w.year && w.month){
    const y=Number(w.year),m=Number(w.month);
    return {start:mk(y,m,1),end:mk(y,m+1,0),specificity:4};
  }
  if(precision==='season' && w.year && w.season){
    const y=Number(w.year),s=String(w.season).toLowerCase();
    const map={spring:[3,5],summer:[6,8],autumn:[9,11],fall:[9,11],winter:[12,2]};
    const mm=map[s];
    if(mm){
      if(s==='winter') return {start:mk(y,12,1),end:yearEnd(y),specificity:3};
      return {start:mk(y,mm[0],1),end:mk(y,mm[1]+1,0),specificity:3};
    }
  }
  if(precision==='year' && w.year){
    const y=Number(w.year);return {start:mk(y,1,1),end:yearEnd(y),specificity:2};
  }
  if(precision==='range' && w.from){
    const a=Number(w.from),b=Math.max(a,Number(w.to)||a);
    return {start:mk(a,1,1),end:yearEnd(b),specificity:1};
  }
  const raw=String(e.date||'').slice(0,10);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){const t=mk(m[1],m[2],m[3]);return {start:t,end:t,specificity:5}}
  return {start:0,end:0,specificity:0};
}
function compareEncountersNewest(a,b){
  const A=encounterChronology(a),B=encounterChronology(b);
  // If the represented periods overlap, the more precise entry comes first.
  const overlap=A.start<=B.end && B.start<=A.end;
  if(overlap && A.specificity!==B.specificity) return B.specificity-A.specificity;
  // Otherwise order by the latest point each encounter can represent.
  if(A.end!==B.end) return B.end-A.end;
  if(A.start!==B.start) return B.start-A.start;
  if(A.specificity!==B.specificity) return B.specificity-A.specificity;
  return Number(b.createdAt||b.id||0)-Number(a.createdAt||a.id||0);
}

function encounterSummaryLines(e){
  const lines=[];
  const happened=(e.happened||[]).filter(Boolean);
  if(happened.length) lines.push(happened.join(' · '));

  const details=[];
  ['Handjob','Blowjob','Fucking','Oral','Anal','Rim'].forEach(k=>{
    const vals=e.happenedDetails?.[k];
    if(Array.isArray(vals)) details.push(...vals);
    else if(vals) details.push(vals);
  });
  if((e.other||'').trim()) details.push(e.other.trim());
  if(details.length) lines.push(details.join(' · '));

  const protection=(e.protection||e.health||[]).filter(Boolean);
  if(protection.length) lines.push(protection.join(' · '));
  if(e.when?.precision!=='exact' && e.when?.multipleEncounters) lines.push('Multiple encounters');
  return lines;
}

async function renderPerson(){
  const p=await get('people',state.selectedPersonId);
  if(!p){state.screen='collection';return render()}
  const photoRecord=await personPhoto(p.id);
  const photoUrl=photoObjectUrl(photoRecord);
  const encounters=(await all('encounters'))
    .filter(e=>e.personId===p.id)
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const avg=avgRating(encounters);
  const about=personAboutSummary(p);
  const spicy=privateSummary(p);
  const note=(p.lastMemory||'').trim();

  app.innerHTML=`<main class="person-profile">
    <header class="person-profile-head">
      <button class="profile-back" id="profileBack" type="button" aria-label="Back">‹</button>
      <div class="profile-head-copy">
        <div class="profile-name-row">
          <h1 id="profileNameText">${esc(displayName(p))}</h1>
          <button class="profile-name-edit" id="editName" type="button" aria-label="Edit name">✎</button>
        </div>
        ${note?`<p>${esc(note)}</p>`:''}
      </div>
      <div class="profile-head-tools">
        ${avg==='—'?'':`<div class="profile-average"><span>★</span>${avg}</div>`}
        <button class="note-icon-button ${String(p.privateNote||'').trim()?'has-note':''}" id="personNoteButton" type="button" aria-label="Private note">
          ${noteIconMarkup()}<span class="note-dot"></span>
        </button>
      </div>
    </header>

    ${photoUrl?`<section class="profile-photo-section">
      <button class="profile-photo" id="profilePhoto" type="button" aria-label="View photo">
        <img src="${photoUrl}" alt="">
      </button>
    </section>`:''}

    ${about.length?`<section class="profile-section">
      <div class="profile-section-title">ABOUT HIM</div>
      <div class="profile-facts">${about.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    </section>`:''}

    ${spicy.length?`<section class="profile-section">
      <div class="profile-section-title">SPICY DETAILS</div>
      <div class="spicy-summary-list">
        ${spicy.map(x=>`<div class="spicy-summary-row">
          <img src="${x.icon}" alt="">
          <div>
            ${x.bits.length?`<div class="spicy-summary-bits">${x.bits.map(esc).join(' · ')}</div>`:''}
            ${x.note?`<div class="spicy-summary-note">${esc(x.note)}</div>`:''}
          </div>
        </div>`).join('')}
      </div>
    </section>`:''}

    <section class="profile-section encounters-section">
      <div class="encounters-title-row">
        <div class="profile-section-title">ENCOUNTERS</div>
      </div>
      <div class="profile-encounters">
        ${encounters.length?encounters.map(e=>{
          const lines=encounterSummaryLines(e);
          return `<button class="profile-encounter-card" data-encounter="${e.id}" type="button">
            <div class="profile-encounter-top">
              <span class="profile-encounter-date-note">
                <strong>${esc(encounterWhenLabel(e))}</strong>
                <span class="profile-note-marker profile-note-action ${String(e.privateNote||'').trim()?'has-note':''}" data-enc-note="${e.id}" role="button" tabindex="0" aria-label="Private note">
                  ${noteIconMarkup()}<span class="note-dot"></span>
                </span>
              </span>
              <span class="profile-encounter-meta">
                ${e.rating?`<span class="profile-encounter-rating">★ ${e.rating}</span>`:''}
              </span>
            </div>
            ${lines.map(x=>`<div class="profile-encounter-line">${esc(x)}</div>`).join('')}
          </button>`;
        }).join(''):`<div class="profile-no-encounters">No encounters yet.</div>`}
      </div>
      <button class="profile-add-encounter-wide" id="addEncounter" type="button">ADD ENCOUNTER</button>
    </section>

    <div class="profile-actions">
      <button class="profile-edit" id="editPerson" type="button">MORE ABOUT HIM</button>
      <button class="profile-delete" id="deletePerson" type="button">Delete person</button>
    </div>

    <div class="note-modal" id="nameEditModal" hidden>
      <button class="note-modal-backdrop" id="nameEditBackdrop" type="button" aria-label="Close"></button>
      <section class="note-sheet" role="dialog" aria-modal="true" aria-labelledby="nameEditTitle">
        <div class="note-sheet-head">
          <div><div class="note-sheet-kicker">NAME / NICK</div><h2 id="nameEditTitle">Who is he?</h2></div>
          <button class="note-close" id="nameEditClose" type="button" aria-label="Close">×</button>
        </div>
        <input class="name-edit-input" id="nameEditInput" value="${esc(p.name||'')}" placeholder="Name / Nick">
        <button class="name-edit-done" id="nameEditDone" type="button">DONE</button>
      </section>
    </div>

    <div class="note-modal" id="profileEncounterNoteModal" hidden>
      <button class="note-modal-backdrop" id="profileEncounterNoteBackdrop" type="button" aria-label="Close note"></button>
      <section class="note-sheet" role="dialog" aria-modal="true" aria-labelledby="profileEncounterNoteTitle">
        <div class="note-sheet-head">
          <div>
            <div class="note-sheet-kicker">PRIVATE NOTE</div>
            <h2 id="profileEncounterNoteTitle">This encounter</h2>
          </div>
          <button class="note-close" id="profileEncounterNoteClose" type="button" aria-label="Close">×</button>
        </div>
        <textarea class="note-textarea" id="profileEncounterNoteText" placeholder=""></textarea>
        <button class="note-done" id="profileEncounterNoteDone" type="button">DONE</button>
      </section>
    </div>

    <div class="note-modal" id="personNoteModal" hidden>
      <button class="note-modal-backdrop" id="personNoteBackdrop" type="button" aria-label="Close note"></button>
      <section class="note-sheet" role="dialog" aria-modal="true" aria-labelledby="personNoteTitle">
        <div class="note-sheet-head">
          <div>
            <div class="note-sheet-kicker">PRIVATE NOTE</div>
            <h2 id="personNoteTitle">${esc(displayName(p))}</h2>
          </div>
          <button class="note-close" id="personNoteClose" type="button" aria-label="Close">×</button>
        </div>
        <textarea class="note-textarea" id="personNoteText" placeholder="">${esc(p.privateNote||'')}</textarea>
        <button class="note-done" id="personNoteDone" type="button">DONE</button>
      </section>
    </div>

    ${photoUrl?`<div class="photo-viewer" id="profilePhotoViewer" hidden>
      <button class="photo-viewer-backdrop" id="profilePhotoBackdrop" type="button" aria-label="Close"></button>
      <div class="photo-viewer-stage">
        <img src="${photoUrl}" alt="">
        <button class="photo-viewer-close" id="profilePhotoClose" type="button" aria-label="Close">×</button>
      </div>
    </div>`:''}

    <div class="profile-delete-modal" id="deleteModal" hidden>
      <button class="profile-delete-backdrop" id="deleteBackdrop" aria-label="Cancel"></button>
      <section class="profile-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="deleteTitle">
        <h2 id="deleteTitle">Delete ${esc(displayName(p))}?</h2>
        <p>This will also delete all encounters with him.</p>
        <div class="profile-delete-buttons">
          <button id="cancelDelete" type="button">Cancel</button>
          <button id="confirmDelete" type="button">Delete</button>
        </div>
      </section>
    </div>

    ${nav('collection')}
  </main>`;

  document.getElementById('profileBack').onclick=()=>{state.screen='collection';render()};
  document.getElementById('editPerson').onclick=()=>{state.detailsReturn='person';state.screen='about';render()};
  if(photoUrl){
    const pv=document.getElementById('profilePhotoViewer');
    const openPhoto=()=>{pv.hidden=false;document.body.classList.add('modal-open')};
    const closePhoto=()=>{pv.hidden=true;document.body.classList.remove('modal-open')};
    document.getElementById('profilePhoto').onclick=openPhoto;
    document.getElementById('profilePhotoBackdrop').onclick=closePhoto;
    document.getElementById('profilePhotoClose').onclick=closePhoto;
  }

  document.getElementById('addEncounter').onclick=async()=>{
    const today=new Date().toISOString().slice(0,10);
    const id=await add('encounters',{
      personId:p.id,
      date:new Date().toISOString(),
      when:{precision:'exact',date:today},
      happened:[],
      happenedDetails:{},
      protection:[],
      rating:0,
      createdAt:Date.now()
    });
    state.selectedEncounterId=id;
    state.detailsReturn='person';
    state.screen='encounterEdit';
    render();
  };

  document.querySelectorAll('[data-encounter]').forEach(b=>b.onclick=()=>{
    state.selectedEncounterId=Number(b.dataset.encounter);
    state.detailsReturn='person';
    state.screen='encounterEdit';
    render();
  });


  const profileEncounterNoteModal=document.getElementById('profileEncounterNoteModal');
  const profileEncounterNoteText=document.getElementById('profileEncounterNoteText');
  let profileEncounterNoteId=null;
  const closeProfileEncounterNote=()=>{
    profileEncounterNoteModal.hidden=true;
    document.body.classList.remove('modal-open');
    profileEncounterNoteId=null;
  };
  const openProfileEncounterNote=async(id)=>{
    const item=await get('encounters',Number(id));
    if(!item)return;
    profileEncounterNoteId=item.id;
    profileEncounterNoteText.value=item.privateNote||'';
    profileEncounterNoteModal.hidden=false;
    document.body.classList.add('modal-open');
    setTimeout(()=>profileEncounterNoteText.focus(),80);
  };
  document.querySelectorAll('[data-enc-note]').forEach(b=>{
    const open=ev=>{ev.preventDefault();ev.stopPropagation();openProfileEncounterNote(b.dataset.encNote)};
    b.onclick=open;
    b.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();openProfileEncounterNote(b.dataset.encNote)}};
  });
  document.getElementById('profileEncounterNoteBackdrop').onclick=closeProfileEncounterNote;
  document.getElementById('profileEncounterNoteClose').onclick=closeProfileEncounterNote;
  document.getElementById('profileEncounterNoteDone').onclick=closeProfileEncounterNote;
  profileEncounterNoteText.oninput=async()=>{
    if(!profileEncounterNoteId)return;
    const item=await get('encounters',profileEncounterNoteId);
    if(!item)return;
    item.privateNote=profileEncounterNoteText.value;
    await put('encounters',item);
    const marker=document.querySelector(`[data-enc-note="${profileEncounterNoteId}"]`);
    if(marker)marker.classList.toggle('has-note',!!profileEncounterNoteText.value.trim());
  };

  const nameEditModal=document.getElementById('nameEditModal');
  const nameEditInput=document.getElementById('nameEditInput');
  const editNameButton=document.getElementById('editName');
  const profileNameText=document.getElementById('profileNameText');
  const openNameEdit=()=>{nameEditModal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>{nameEditInput.focus();nameEditInput.select()},80)};
  const closeNameEdit=()=>{nameEditModal.hidden=true;document.body.classList.remove('modal-open')};
  editNameButton.onclick=openNameEdit;
  document.getElementById('nameEditBackdrop').onclick=closeNameEdit;
  document.getElementById('nameEditClose').onclick=closeNameEdit;
  document.getElementById('nameEditDone').onclick=closeNameEdit;
  nameEditInput.oninput=async()=>{p.name=nameEditInput.value.trim();await put('people',p);profileNameText.textContent=displayName(p)};

  const personNoteModal=document.getElementById('personNoteModal');
  const personNoteButton=document.getElementById('personNoteButton');
  const personNoteText=document.getElementById('personNoteText');
  const openPersonNote=()=>{
    personNoteModal.hidden=false;
    document.body.classList.add('modal-open');
    setTimeout(()=>personNoteText.focus(),80);
  };
  const closePersonNote=()=>{
    personNoteModal.hidden=true;
    document.body.classList.remove('modal-open');
  };
  personNoteButton.onclick=openPersonNote;
  document.getElementById('personNoteBackdrop').onclick=closePersonNote;
  document.getElementById('personNoteClose').onclick=closePersonNote;
  document.getElementById('personNoteDone').onclick=closePersonNote;
  personNoteText.oninput=async()=>{
    p.privateNote=personNoteText.value;
    await put('people',p);
    personNoteButton.classList.toggle('has-note',!!personNoteText.value.trim());
  };

  const modal=document.getElementById('deleteModal');
  const openDelete=()=>{modal.hidden=false;document.body.classList.add('modal-open')};
  const closeDelete=()=>{modal.hidden=true;document.body.classList.remove('modal-open')};
  document.getElementById('deletePerson').onclick=openDelete;
  document.getElementById('deleteBackdrop').onclick=closeDelete;
  document.getElementById('cancelDelete').onclick=closeDelete;
  document.getElementById('confirmDelete').onclick=async()=>{
    for(const e of encounters) await remove('encounters',e.id);
    await remove('photos',p.id);
    await remove('people',p.id);
    document.body.classList.remove('modal-open');
    state.selectedPersonId=null;
    state.selectedEncounterId=null;
    state.screen='collection';
    render();
  };

  attachNav();
}
async function renderEncounter(){
 const e=await get('encounters',state.selectedEncounterId); const p=await get('people',e.personId); state.selectedPersonId=p.id;
 const chips=(label,arr)=>arr?.length?`<div class="encounter-section"><span>${label}</span><div class="chips readonly">${arr.map(x=>`<span class="chip on">${esc(x)}</span>`).join('')}</div></div>`:'';
 app.innerHTML=`<button class="linkbtn" id="back">← ${esc(displayName(p))}</button><div class="encounter-head"><div class="eyebrow">ENCOUNTER</div><h1>${fmt(e.date)}</h1><div class="big-rating">${e.rating?`★ ${e.rating}`:'Not rated'}</div></div>
 <div class="card"><div class="eyebrow">MENTAL NOTE</div><p class="encounter-note">${esc(e.memory||'Nothing written down.')}</p>${chips('POSITION',e.position)}${chips('WHAT HAPPENED',e.happened)}${chips('HEALTH',e.health)}</div>
 <div class="section-title"><h2>Add / edit</h2><span>this encounter</span></div><div class="encounter-actions"><button class="secondary" data-edit="position">Position</button><button class="secondary" data-edit="happened">What happened</button><button class="secondary" data-edit="health">Health</button></div>
 <p class="small" style="text-align:center;margin-top:16px">🔒 Stored on this device</p>`;
 document.getElementById('back').onclick=()=>{state.screen='person';render()};
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{state.detailsReturn='person';state.screen='encounterEdit';render()});
}

function timelineSortKey(e){
  const w=e.when||{};
  if(w.precision==='range')return new Date(Number(w.to||w.from)||0,11,31).getTime();
  if(w.precision==='year')return new Date(Number(w.year)||0,6,1).getTime();
  if(w.precision==='season')return new Date(Number(w.year)||0,({Winter:1,Spring:4,Summer:7,Autumn:10,Fall:10}[w.season]||7)-1,15).getTime();
  if(w.precision==='month')return new Date(Number(w.year)||0,(Number(w.month)||1)-1,15).getTime();
  const raw=String(w.date||e.date||'').slice(0,10),d=new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime())?new Date(e.date||0).getTime():d.getTime();
}
function timelineGroupLabel(e){
  const w=e.when||{},m=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  if(w.precision==='month'&&w.month&&w.year)return `${m[+w.month-1]} ${w.year}`;
  if(w.precision==='season'&&w.season&&w.year)return `${String(w.season).toUpperCase()} ${w.year}`;
  if(w.precision==='year'&&w.year)return String(w.year);
  if(w.precision==='range'&&w.from)return `${w.from}${w.to?` — ${w.to}`:''}`;
  const raw=String(w.date||e.date||'').slice(0,10),d=new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime())?'UNDATED':`${m[d.getMonth()]} ${d.getFullYear()}`;
}
function timelineShortDate(e){
  const w=e.when||{};
  if(w.precision==='exact'||!w.precision){
    const raw=String(w.date||e.date||'').slice(0,10),d=new Date(`${raw}T12:00:00`);
    if(!Number.isNaN(d.getTime()))return new Intl.DateTimeFormat('en-US',{day:'numeric',month:'short'}).format(d);
  }
  if(w.precision==='month'){
    const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${m[(Number(w.month)||1)-1]} ${w.year||''}`.trim();
  }
  if(w.precision==='season'){
    const s=String(w.season||'').toLowerCase();
    const seasons={spring:'Spring',summer:'Summer',autumn:'Autumn',fall:'Autumn',winter:'Winter'};
    return `${seasons[s]||'Season'} ${w.year||''}`.trim();
  }
  if(w.precision==='year')return String(w.year||'');
  if(w.precision==='range')return `${w.from||''}${w.to?`–${w.to}`:''}`.trim();
  return encounterWhenLabel(e);
}
async function renderTimeline(){
  const people=await all('people'), encounters=(await all('encounters')).sort((a,b)=>timelineSortKey(b)-timelineSortKey(a));
  const pm=new Map(people.map(p=>[p.id,p])); let last=null;
  const items=encounters.map(e=>{
    const p=pm.get(e.personId); if(!p)return '';
    const g=timelineGroupLabel(e),gm=''; last=g;
    const lines=(()=>{
      const broad=(e.happened||[]).filter(x=>x && x!=='Other');
      if((e.happened||[]).includes('Other')){
        const other=String(e.other||'').trim();
        broad.push(other||'Other');
      }
      return broad;
    })();
    return `${gm}<article class="timeline-item"><div class="timeline-rail"><div class="timeline-date">${esc(timelineShortDate(e))}</div><span class="timeline-dot"></span></div>
      <button class="timeline-card" data-timeline-encounter="${e.id}"><div class="timeline-card-top"><strong>${esc(displayName(p))}</strong><span class="timeline-meta">
      ${String(e.privateNote||'').trim()?`<span class="timeline-note">${noteIconMarkup()}</span>`:''}${e.rating?`<span class="timeline-rating">★ ${e.rating}</span>`:''}</span></div>
      ${lines.length?`<div class="timeline-line">${esc(lines.join(' · '))}</div>`:''}</button></article>`;
  }).join('');
  app.innerHTML=`<main class="people-timeline"><header class="people-head"><div><h1>People</h1></div><button class="people-add" id="timelineAdd">+</button></header>
  <div class="people-view-switch"><button id="openCollection">COLLECTION</button><button class="active">TIMELINE</button></div>
  <div class="timeline-list">${items||`<div class="timeline-empty">Your encounters will appear here.</div>`}</div>${nav('collection')}</main>`;
  openCollection.onclick=()=>{state.screen='collection';render()};
  timelineAdd.onclick=()=>{state.quick={rating:0,mode:'new'};state.screen='add';render()};
  document.querySelectorAll('[data-timeline-encounter]').forEach(c=>c.onclick=()=>{
    const e=encounters.find(x=>x.id===+c.dataset.timelineEncounter);
    if(!e)return;
    state.selectedPersonId=e.personId;
    state.screen='person';
    render();
  });
  attachNav();
}
function collectionDescription(p){
  const a=p.about||{};
  const age={young:'young','30s':'in his 30s',middle:'middle-aged',older:'older'}[a.ageBand];
  const height={short:'short',medium:'medium-height',tall:'tall'}[a.heightBand];
  const br=(Array.isArray(a.build)&&a.build[0])||a.buildVisual||'';
  const build={slim:'slim',average:'average-build',athletic:'athletic',big:'big'}[String(br).toLowerCase()];
  const tr=(Array.isArray(a.types)&&a.types[0])||a.type||'';
  const type={twink:'twink',bear:'bear',daddy:'daddy',otter:'otter'}[String(tr).toLowerCase()];
  const traits=[height,build,type].filter(Boolean);
  if(!traits.length&&!age)return '';
  let lead=traits.join(' ');
  if(lead)lead=lead[0].toUpperCase()+lead.slice(1);
  if(age){
    if(!lead)return age[0].toUpperCase()+age.slice(1)+'.';
    if(age==='in his 30s')return `${lead} in his 30s.`;
    return `${lead}, ${age}.`;
  }
  return `${lead}.`;
}
async function renderCollection(){
  const people=await all('people'), encounters=await all('encounters');
  const rows=people.map(p=>{
    const es=encounters.filter(e=>e.personId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    return {p,es,last:es[0],description:collectionDescription(p)};
  }).sort((a,b)=>new Date(b.last?.date||b.p.createdAt||0)-new Date(a.last?.date||a.p.createdAt||0));

  app.innerHTML=`<main class="people-collection">
    <header class="people-head"><div><h1>People</h1></div>
    <button class="people-add" id="peopleAdd" type="button" aria-label="Add a new guy">+</button></header>
    <div class="people-view-switch"><button class="active">COLLECTION</button><button id="openTimeline">TIMELINE</button></div>
    <div class="people-search"><input id="search" type="search" placeholder="Find someone…" autocomplete="off"></div>
    <div id="collectionList" class="collection-list">${collectionMarkup(rows,state.collectionHighlight)}</div>
    ${nav('collection')}</main>`;

  search.oninput=()=>{
    const q=search.value.trim().toLowerCase();
    const filtered=!q?rows:rows.filter(({p,description})=>`${p.name||''} ${p.lastMemory||''} ${description}`.toLowerCase().includes(q));
    collectionList.innerHTML=collectionMarkup(filtered,null); attachCollectionRows();
  };
  peopleAdd.onclick=()=>{state.quick={rating:0,mode:'new'};state.screen='add';render()};
  document.getElementById('openTimeline').onclick=()=>{state.screen='timeline';render()};
  attachCollectionRows();attachNav();

  if(state.collectionHighlight){
    const id=state.collectionHighlight; state.collectionHighlight=null;
    requestAnimationFrame(()=>{
      const card=document.querySelector(`[data-person="${id}"]`);
      if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.classList.add('just-added');setTimeout(()=>card.classList.remove('just-added'),1800)}
    });
  }
}
function collectionMarkup(rows,highlightId=null){
  if(!rows.length)return `<div class="collection-empty">Nobody here yet.</div>`;
  return rows.map(({p,es,description})=>{
    const avg=avgRating(es), note=(p.lastMemory||'').trim();
    return `<button class="collection-person ${Number(highlightId)===Number(p.id)?'pending-highlight':''}" data-person="${p.id}" type="button">
      <div class="collection-card-top"><h2>${esc(displayName(p))}</h2>${avg==='—'?'':`<div class="collection-rating"><span>★</span>${avg}</div>`}</div>
      ${note?`<div class="collection-memory">${esc(note)}</div>`:''}
      ${description?`<div class="collection-description">${esc(description)}</div>`:''}
    </button>`;
  }).join('');
}
function attachCollectionRows(){document.querySelectorAll('[data-person]').forEach(x=>x.onclick=()=>{state.selectedPersonId=Number(x.dataset.person);state.screen='person';render()})}

(async()=>{
  db=await openDB();
  render();
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=10.17');
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

