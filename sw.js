const CACHE='body-count-v8.2';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=8.2',
'./app.js?v=8.2',
'./manifest.webmanifest?v=8.2',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=82',
  './assets/age-30s.jpg?v=82',
  './assets/age-middle.jpg?v=82',
  './assets/age-older.jpg?v=82',
  './assets/body-slim.jpg?v=82',
  './assets/body-average.jpg?v=82',
  './assets/body-athletic.jpg?v=82',
  './assets/body-big.jpg?v=82',
  './assets/type-twink.jpg?v=82',
  './assets/type-twonk.jpg?v=82',
  './assets/type-otter.jpg?v=82',
  './assets/type-average.jpg?v=82',
  './assets/type-bear.jpg?v=82',
  './assets/type-daddy.jpg?v=82',
  './assets/detail-eggplant.png?v=82',
  './assets/detail-peach.png?v=82',
  './assets/detail-drops.png?v=82',
  './assets/detail-eggplant.png?v=82',
  './assets/detail-peach.png?v=82',
  './assets/detail-drops.png?v=82'
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
