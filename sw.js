const CACHE='body-count-v4.8';
const ASSETS=[
'./',
'./index.html',
'./styles.css?v=4.8',
'./app.js?v=4.8',
'./manifest.webmanifest?v=4.8',
'./icon.svg',
'./brand-mark.png',
  './assets/age-young.jpg?v=48',
  './assets/age-30s.jpg?v=48',
  './assets/age-middle.jpg?v=48',
  './assets/age-older.jpg?v=48',
  './assets/body-slim.jpg?v=48',
  './assets/body-average.jpg?v=48',
  './assets/body-athletic.jpg?v=48',
  './assets/body-big.jpg?v=48',
  './assets/type-twink.jpg?v=48',
  './assets/type-twonk.jpg?v=48',
  './assets/type-otter.jpg?v=48',
  './assets/type-average.jpg?v=48',
  './assets/type-bear.jpg?v=48',
  './assets/type-daddy.jpg?v=48',
  './assets/detail-eggplant.svg?v=48',
  './assets/detail-peach.svg?v=48',
  './assets/detail-drops.svg?v=48',
  './assets/detail-eggplant.svg?v=48',
  './assets/detail-peach.svg?v=48',
  './assets/detail-drops.svg?v=48'
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
