/* Static-only offline fallback. Never caches personal records or API responses. */
const CACHE="gflm-static-v5-20261113";
const FILES=["./","./index.html","./main.js","./operations.js","./fieldplus.js","./styles.css","./operations.css","./fieldplus.css","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith("gflm-static-")&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(!["document","script","style","image","manifest"].includes(request.destination))return;
 event.respondWith(fetch(request).then(response=>{
   if(response.ok&&response.type==="basic"){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});}
   return response;
 }).catch(()=>caches.match(request).then(hit=>hit||((request.mode==="navigate")?caches.match("./index.html"):Response.error()))));
});