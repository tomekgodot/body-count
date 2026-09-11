const CACHE='body-count-v4.7';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=4.7',
'./app.js?v=4.7',
'./manifest.webmanifest?v=4.7',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=47',
  './assets/age-30s.jpg?v=47',
  './assets/age-middle.jpg?v=47',
  './assets/age-older.jpg?v=47',
  './assets/body-slim.jpg?v=47',
  './assets/body-average.jpg?v=47',
  './assets/body-athletic.jpg?v=47',
  './assets/body-big.jpg?v=47',
  './assets/type-twink.jpg?v=47',
  './assets/type-twonk.jpg?v=47',
  './assets/type-otter.jpg?v=47',
  './assets/type-average.jpg?v=47',
  './assets/type-bear.jpg?v=47',
  './assets/type-daddy.jpg?v=47',
  './assets/detail-eggplant.svg?v=47',
  './assets/detail-peach.svg?v=47',
  './assets/detail-drops.svg?v=47',
  './assets/detail-eggplant.svg?v=47',
  './assets/detail-peach.svg?v=47',
  './assets/detail-drops.svg?v=47'
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
