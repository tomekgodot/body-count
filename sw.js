const CACHE='body-count-v10.1';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=10.1',
'./app.js?v=10.1',
'./manifest.webmanifest?v=10.1',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=101',
  './assets/age-30s.jpg?v=101',
  './assets/age-middle.jpg?v=101',
  './assets/age-older.jpg?v=101',
  './assets/body-slim.jpg?v=101',
  './assets/body-average.jpg?v=101',
  './assets/body-athletic.jpg?v=101',
  './assets/body-big.jpg?v=101',
  './assets/type-twink.jpg?v=101',
  './assets/type-twonk.jpg?v=101',
  './assets/type-otter.jpg?v=101',
  './assets/type-average.jpg?v=101',
  './assets/type-bear.jpg?v=101',
  './assets/type-daddy.jpg?v=101',
  './assets/detail-eggplant.png?v=101',
  './assets/detail-peach.png?v=101',
  './assets/detail-drops.png?v=101',
  './assets/detail-eggplant.png?v=101',
  './assets/detail-peach.png?v=101',
  './assets/detail-drops.png?v=101'
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
