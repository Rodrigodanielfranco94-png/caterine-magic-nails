const CACHE='caterine-nails-v2';
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
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?event.data.text():''}}
  const title=data.title||'Caterine Magic Nails';
  const options={
    body:data.body||'Tienes una actualización en tu agenda.',
    icon:'/caterine-app-icon.svg',
    badge:'/caterine-app-icon.svg',
    data:data.data||{url:'/caterine-panel.html'},
    tag:data.tag||'caterine-agenda',
    renotify:true
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification?.data?.url||'/caterine-panel.html';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client){client.navigate(url);return client.focus()}
    }
    return clients.openWindow?clients.openWindow(url):undefined;
  }));
});
