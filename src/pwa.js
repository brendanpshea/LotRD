// src/pwa.js — the game as an installable app (manifest.webmanifest, sw.js).
//
// The service worker is registered only where it belongs: on the website, opened
// as a page of its own. Not inside an LMS package, whose files the LMS serves and
// replaces when a package is republished, and whose page carries no manifest
// (SCORM/build.py strips it); and not in a frame, where the page is part of
// someone else's site.

/**
 * Whether to register the service worker on this page.
 * @param {{hasServiceWorker: boolean, secure: boolean, hasManifest: boolean,
 *          inLms: boolean, topLevel: boolean}} page
 */
export function shouldRegister(page) {
  return page.hasServiceWorker && page.secure && page.hasManifest && !page.inLms && page.topLevel;
}

/** What shouldRegister needs to know, read from the live page. */
export function describePage(win = window) {
  let topLevel = false;
  try { topLevel = win.self === win.top; } catch (_) { topLevel = false; }
  const doc = win.document;
  return {
    hasServiceWorker: "serviceWorker" in win.navigator,
    secure: !!win.isSecureContext,
    hasManifest: !!doc.querySelector('link[rel="manifest"]'),
    // The SCORM shim runs before the game and names itself; a single-set
    // package also says which set it is. Either means an LMS package.
    inLms: !!(win.LotrdScorm || win.LOTRD_SINGLE_SET || doc.querySelector('script[src*="scorm-shim"]')),
    topLevel,
  };
}

/** Register sw.js once the page has loaded, so it never competes with the game for the network. */
export function registerServiceWorker(win = window) {
  if (!shouldRegister(describePage(win))) return;
  const register = () => win.navigator.serviceWorker.register("sw.js")
    .catch(err => console.warn("The game could not be made installable:", err));
  if (win.document.readyState === "complete") register();
  else win.addEventListener("load", register, { once: true });
}
