const CACHE='body-count-v6.6';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=6.6',
'./app.js?v=6.6',
'./manifest.webmanifest?v=6.6',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=66',
  './assets/age-30s.jpg?v=66',
  './assets/age-middle.jpg?v=66',
  './assets/age-older.jpg?v=66',
  './assets/body-slim.jpg?v=66',
  './assets/body-average.jpg?v=66',
  './assets/body-athletic.jpg?v=66',
  './assets/body-big.jpg?v=66',
  './assets/type-twink.jpg?v=66',
  './assets/type-twonk.jpg?v=66',
  './assets/type-otter.jpg?v=66',
  './assets/type-average.jpg?v=66',
  './assets/type-bear.jpg?v=66',
  './assets/type-daddy.jpg?v=66',
  './assets/detail-eggplant.png?v=66',
  './assets/detail-peach.png?v=66',
  './assets/detail-drops.png?v=66',
  './assets/detail-eggplant.png?v=66',
  './assets/detail-peach.png?v=66',
  './assets/detail-drops.png?v=66'
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
