const CACHE='caterine-nails-v1';
const APP_SHELL=['/caterine-panel.html','/manifest.webmanifest','/caterine-app-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  if(new URL(req.url).pathname.startsWith('/api/'))return;
  event.respondWith(fetch(req).then(res=>{
    const copy=res.clone();
    caches.open(CACHE).then(cache=>cache.put(req,copy));
    return res;
  }).catch(()=>caches.match(req).then(r=>r||caches.match('/caterine-panel.html'))));
});