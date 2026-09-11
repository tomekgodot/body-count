const CACHE='body-count-v3.3.1';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=3.3.1',
'./app.js?v=3.3.1',
'./manifest.webmanifest?v=3.3.1',
'./icon.svg',
'./brand-mark.png',
'./assets/age-portrait.jpg?v=331',
'./assets/body-figure.jpg?v=331',
'./assets/type-portrait.jpg?v=331'
];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;
  e.respondWith(
    fetch(req,{cache:'no-store'}).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(req,copy));
      return r;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
});
