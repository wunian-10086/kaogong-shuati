/* 考公刷题机 Service Worker：缓存页面与题库，支持手机/平板离线使用 */
// 换版本号会让旧的 Service Worker 缓存整体失效，用户才能拿到更新后的题库/页面
const CACHE = "kaogong-v3-20260928";
const CORE = [
  "./", "./index.html", "./app.js", "./styles.css", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;              // 接口永远走网络
  // 页面/脚本/样式/题库数据走「网络优先」，保证联网时一定是最新版；
  // 图片等静态素材走「缓存优先」，省流量、离线也能看。
  const isShell =
    req.mode === "navigate" ||
    /\.(js|css|html|webmanifest)$/.test(url.pathname) ||
    url.pathname.endsWith("/");
  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
