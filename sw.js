const CACHE='body-count-v5.5';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=5.5',
'./app.js?v=5.5',
'./manifest.webmanifest?v=5.5',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=55',
  './assets/age-30s.jpg?v=55',
  './assets/age-middle.jpg?v=55',
  './assets/age-older.jpg?v=55',
  './assets/body-slim.jpg?v=55',
  './assets/body-average.jpg?v=55',
  './assets/body-athletic.jpg?v=55',
  './assets/body-big.jpg?v=55',
  './assets/type-twink.jpg?v=55',
  './assets/type-twonk.jpg?v=55',
  './assets/type-otter.jpg?v=55',
  './assets/type-average.jpg?v=55',
  './assets/type-bear.jpg?v=55',
  './assets/type-daddy.jpg?v=55',
  './assets/detail-eggplant.png?v=55',
  './assets/detail-peach.png?v=55',
  './assets/detail-drops.png?v=55',
  './assets/detail-eggplant.png?v=55',
  './assets/detail-peach.png?v=55',
  './assets/detail-drops.png?v=55'
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
