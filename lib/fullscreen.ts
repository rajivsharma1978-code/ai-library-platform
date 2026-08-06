// ── Cross-browser Fullscreen API compatibility layer ────────────────────
// Every Premium Reader call site that touches document.*fullscreen* goes
// through this module instead of the raw DOM API directly, so there is
// exactly one place that knows about legacy vendor prefixes and the real
// (non-hackable) platform limitations below.
//
// iOS Safari limitation — READ BEFORE "fixing" fullscreen on iPhone:
// iPhone/iPod Safari does not implement the Fullscreen API for arbitrary
// HTML elements, on any current iOS version. `document.fullscreenEnabled`
// is `false`, `Element.prototype.requestFullscreen` does not exist, and
// there is no vendor-prefixed equivalent either (Apple restricts true
// fullscreen to <video> via the separate, unrelated
// HTMLVideoElement.webkitEnterFullscreen, and to web apps launched from
// the Home Screen in standalone display mode). This is a deliberate
// platform policy, not a bug — there is no supported trick (100vh
// juggling, scrolling the chrome away, meta-tag flags, etc.) that forces
// real fullscreen on an iPhone Safari tab, and this module does not
// attempt one. What it does instead, and what the Premium Reader wires
// up around it: detect the limitation reliably (isFullscreenApiSupported
// below), hide the now-useless Fullscreen button, and fall back to the
// closest achievable immersive mode — maximized viewport via 100dvh/
// visualViewport, locked body scroll, hidden app chrome — plus an
// "Add to Home Screen" hint, since a standalone-launched PWA on iOS
// *does* get a chrome-free window.
//
// iPadOS Safari is DIFFERENT and is treated as fullscreen-capable: since
// iPadOS 13, Safari on iPad supports Element.requestFullscreen() the same
// as desktop Safari. iPadOS also masquerades as "Macintosh" in the user
// agent string, so it cannot be told apart from desktop Safari by UA
// alone — `navigator.maxTouchPoints > 1` on a `MacIntel` platform is the
// standard signal that it's actually a touch iPad, used only for the
// getMobileBrowser() label below (never to gate the Fullscreen API
// itself — that's always feature-detected).

export type FullscreenableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
};

// Chrome/Edge/Firefox/Safari(desktop+iPad) use the unprefixed name today;
// these prefixed variants only matter for older Samsung Internet builds
// and some Android WebViews that still ship the legacy WebKit-era names
// alongside (or instead of) the standard one.
const FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"] as const;
const FULLSCREEN_ERROR_EVENTS = ["fullscreenerror", "webkitfullscreenerror", "mozfullscreenerror", "MSFullscreenError"] as const;

/** The element currently fullscreened, across all vendor prefixes. */
export function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? d.msFullscreenElement ?? null;
}

/** Feature-detected support — false on iPhone/iPod Safari (see file-top
 * comment), true on Android Chrome, Samsung Internet, iPad Safari, and
 * every evergreen desktop browser. */
export function isFullscreenApiSupported(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FullscreenDocument;
  return !!(d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? d.mozFullScreenEnabled ?? d.msFullscreenEnabled);
}

/**
 * Requests fullscreen on `el`, trying the standard method first and each
 * vendor-prefixed variant in turn. MUST be called synchronously inside a
 * real user-gesture handler (click/tap/pointerup) — every browser's
 * activation tracking treats an async gap (even a microtask from an
 * awaited call earlier in the same handler) as "no longer a user
 * gesture" and silently rejects. Returns a Promise that resolves once
 * the request has been *made* (not necessarily granted — listen via
 * addFullscreenChangeListener/addFullscreenErrorListener for the real
 * outcome); never throws synchronously.
 */
export function requestFullscreenCompat(el: FullscreenableElement): Promise<void> {
  const target = el as FullscreenableElement;
  try {
    const method = target.requestFullscreen?.bind(target)
      ?? target.webkitRequestFullscreen?.bind(target)
      ?? target.mozRequestFullScreen?.bind(target)
      ?? target.msRequestFullscreen?.bind(target);
    if (!method) return Promise.reject(new Error("Fullscreen API not supported"));
    const result = method();
    return result instanceof Promise ? result : Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Exits fullscreen across all vendor prefixes. Resolves immediately
 * (never rejects into an unhandled state) when nothing is fullscreened. */
export function exitFullscreenCompat(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const d = document as FullscreenDocument;
  try {
    const method = document.exitFullscreen?.bind(document)
      ?? d.webkitExitFullscreen?.bind(d)
      ?? d.mozCancelFullScreen?.bind(d)
      ?? d.msExitFullscreen?.bind(d);
    if (!method) return Promise.resolve();
    const result = method();
    return result instanceof Promise ? result : Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Subscribes to fullscreen-change across every vendor prefix at once;
 * returns a single cleanup function that removes all of them. */
export function addFullscreenChangeListener(cb: () => void): () => void {
  FULLSCREEN_CHANGE_EVENTS.forEach((evt) => document.addEventListener(evt, cb));
  return () => FULLSCREEN_CHANGE_EVENTS.forEach((evt) => document.removeEventListener(evt, cb));
}

/** Subscribes to fullscreen-error across every vendor prefix at once;
 * returns a single cleanup function that removes all of them. */
export function addFullscreenErrorListener(cb: () => void): () => void {
  FULLSCREEN_ERROR_EVENTS.forEach((evt) => document.addEventListener(evt, cb));
  return () => FULLSCREEN_ERROR_EVENTS.forEach((evt) => document.removeEventListener(evt, cb));
}

// ── Best-effort mobile browser label ─────────────────────────────────
// Used only to tailor copy/prefix-order choices — never to gate core
// reader gesture logic (that stays feature/touch-based, see
// PremiumReaderPreviewContent's isMobileViewport/isTouchDevice). UA
// sniffing is inherently best-effort; every branch here fails closed to
// "other" on an unrecognized string, so a wrong guess only ever affects
// cosmetic choices, never breaks a feature outright.
export type MobileBrowserLabel = "android-chrome" | "samsung-internet" | "ios-safari" | "ipad-safari" | "other";

export function getMobileBrowser(): MobileBrowserLabel {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports platform "MacIntel" like a real Mac; a Mac has no
  // touch points, an iPad always does — this is the standard way to tell
  // them apart (Apple never fixed the iPad UA to say "iPad" by default).
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/SamsungBrowser/i.test(ua)) return "samsung-internet";
  if (/iPad/i.test(ua) || isIPadOS) return "ipad-safari";
  if (/iPhone|iPod/i.test(ua)) return "ios-safari";
  if (/Android/i.test(ua) && /Chrome\//i.test(ua)) return "android-chrome";
  return "other";
}

/** True only for iPhone/iPod Safari — the one real "no Fullscreen API at
 * all, permanently" case described in the file-top comment. iPad is
 * deliberately excluded (it supports true fullscreen). */
export function isFullscreenIncapableIOS(): boolean {
  return getMobileBrowser() === "ios-safari" && !isFullscreenApiSupported();
}

/** True when the page is running as a launched-from-Home-Screen /
 * installed PWA (iOS's legacy `navigator.standalone` plus the standard
 * `display-mode: standalone` media query, which covers Android/desktop
 * installed PWAs too). In this mode the OS has already stripped all
 * browser chrome unconditionally — there is no address bar for a scroll
 * gesture to collapse, and the reader should keep its existing
 * fixed-inset immersive shell rather than opt into native-scroll mode
 * (which exists specifically to let a REAL Safari tab's chrome collapse
 * on scroll — nothing to collapse here). */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const mq = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return !!mq || nav.standalone === true;
}
