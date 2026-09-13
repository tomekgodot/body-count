const CACHE='body-count-v10.18';
const ASSETS=[
  './',
  './index.html',
  './styles.css?v=10.18',
  './app.js?v=10.18',
  './manifest.webmanifest?v=10.18',
  './icon.svg',
  './brand-mark.png',
  './assets/age-young.jpg?v=109',
  './assets/age-30s.jpg?v=109',
  './assets/age-middle.jpg?v=109',
  './assets/age-older.jpg?v=109',
  './assets/body-slim.jpg?v=109',
  './assets/body-average.jpg?v=109',
  './assets/body-athletic.jpg?v=109',
  './assets/body-big.jpg?v=109',
  './assets/type-twink.jpg?v=109',
  './assets/type-twonk.jpg?v=109',
  './assets/type-otter.jpg?v=109',
  './assets/type-average.jpg?v=109',
  './assets/type-bear.jpg?v=109',
  './assets/type-daddy.jpg?v=109',
  './assets/detail-eggplant.png?v=109',
  './assets/detail-peach.png?v=109',
  './assets/detail-drops.png?v=117',
  './assets/apple-touch-icon.png?v=1010',
  './assets/icon-192.png?v=1010',
  './assets/icon-512.png?v=1010'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;

  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(req,{cache:'no-store'}).then(response=>{
      if(response.ok && response.type==='basic'){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
      }
      return response;
    }).catch(async()=>{
      const cached=await caches.match(req);
      if(cached) return cached;
      if(req.mode==='navigate'){
        const shell=await caches.match('./index.html');
        if(shell) return shell;
      }
      return new Response('Offline',{status:503,statusText:'Offline'});
    })
  );
});
