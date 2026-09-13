const CACHE='body-count-v10.3';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=10.3',
'./app.js?v=10.3',
'./manifest.webmanifest?v=10.3',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=103',
  './assets/age-30s.jpg?v=103',
  './assets/age-middle.jpg?v=103',
  './assets/age-older.jpg?v=103',
  './assets/body-slim.jpg?v=103',
  './assets/body-average.jpg?v=103',
  './assets/body-athletic.jpg?v=103',
  './assets/body-big.jpg?v=103',
  './assets/type-twink.jpg?v=103',
  './assets/type-twonk.jpg?v=103',
  './assets/type-otter.jpg?v=103',
  './assets/type-average.jpg?v=103',
  './assets/type-bear.jpg?v=103',
  './assets/type-daddy.jpg?v=103',
  './assets/detail-eggplant.png?v=103',
  './assets/detail-peach.png?v=103',
  './assets/detail-drops.png?v=103',
  './assets/detail-eggplant.png?v=103',
  './assets/detail-peach.png?v=103',
  './assets/detail-drops.png?v=103'
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
