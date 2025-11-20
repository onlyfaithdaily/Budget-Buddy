// Name of the cache — update the version any time files change.
const CACHE_NAME = "budgetbuddy-v1";

// Files to cache for offline use
const FILES_TO_CACHE = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install event — add files to cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting(); // Activate new service worker immediately
});

// Activate event — clear old caches if version changed
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
