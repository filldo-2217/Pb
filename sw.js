const CACHE_NAME = "school-survey-v2";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// 같은 사이트의 GET 요청만 처리 (Supabase 등 외부 요청은 건드리지 않음)
self.addEventListener("fetch", event => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.method !== "GET" || url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then(res => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
                return res;
            })
            .catch(() => caches.match(req))
    );
});
