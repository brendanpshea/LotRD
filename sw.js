// sw.js — the service worker that lets the game be installed as an app and open
// with no network.
//
// Network first, always: online, every request goes to the server exactly as it
// would without this worker, so a student gets the current question sets and code
// (the game fetches sets with cache: "no-store" for that reason). Each answer is
// kept, and offline the kept copy is served instead. A page load offline gets the
// kept index.html whatever its ?set= says.
//
// What is kept up front (PRECACHE) is what the game needs to open: the page, its
// code, the catalog and the menu's data. A set, its pictures and its sprites are
// kept the first time they load online, so a set played once can be played
// offline. Narration is left alone: audio is fetched in byte ranges, which a cache
// cannot answer, and the clips would be most of the download.
//
// Progress is not here. It lives in localStorage (and, in a SCORM package, the
// LMS), which this worker never touches. src/pwa.js registers the worker only on
// the website, never inside an LMS package. tests/pwa.test.js checks that every
// file listed here exists and that the game's code is all listed.
//
// Changing CACHE (and so this file) makes browsers fetch the list afresh and drop
// what the older worker kept. Network first means a deploy does not need it.

const CACHE = "lotrd-v1";

const PRECACHE = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "src/app.js",
  "src/controller.js",
  "src/dragon.js",
  "src/heroes.js",
  "src/highlight.js",
  "src/items.js",
  "src/jtiny.js",
  "src/main.js",
  "src/model.js",
  "src/narration.js",
  "src/npcs.js",
  "src/pwa.js",
  "src/pytiny.js",
  "src/sound.js",
  "src/sqlengine.js",
  "src/sqlgrade.js",
  "src/stage.js",
  "src/ui.js",
  "src/util.js",
  "src/zzfx.js",
  "assets/monsters.json",
  "assets/npcs.json",
  "assets/dragon_lines.json",
  "question_sets/catalog.json",
  "question_sets/index.json",
];

/** Whether this worker answers a request at all; anything else goes straight to the network. */
function handles(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has("range")) return false;
  if (url.pathname.includes("/narration/")) return false;
  return true;
}

/** The network's answer, kept for later; or, with no network, the answer kept last time. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch (offline) {
    const navigating = request.mode === "navigate";
    const kept = await cache.match(request, { ignoreSearch: navigating })
      || (navigating ? await cache.match("index.html") : undefined);
    if (kept) return kept;
    throw offline;
  }
}

self.addEventListener("install", event => {
  // "reload" skips the browser's HTTP cache, so the list is what the server has now.
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { cache: "reload" }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith("lotrd-") && name !== CACHE)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (handles(event.request)) event.respondWith(networkFirst(event.request));
});
