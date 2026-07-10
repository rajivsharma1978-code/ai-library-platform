"use client";

// ── Fixed-position portal root ──────────────────────────────────────────
// CSS `filter` on an ancestor creates a new containing block for any
// `position: fixed` descendant (a real browser behavior, not a bug in
// this app) — so once Dark Mode / Visual Comfort's combined filter is
// applied to <body> (see applyA11ySettings in accessibilitySettings.ts),
// anything still living INSIDE <body> and using `position: fixed` stops
// tracking the viewport and starts tracking <body>'s own (scrollable)
// box instead. That silently broke the floating dock's drag math the
// moment Dark Mode was on and the page was scrolled.
//
// The fix: render the floating dock and the Reading Ruler/Mask through a
// portal into a dedicated <div> that's a SIBLING of <body> (a child of
// <html> instead), so they sit outside the filtered subtree entirely and
// keep behaving like normal viewport-fixed elements regardless of which
// accessibility filters are active.
export function getFixedPortalRoot(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("ndl-fixed-portal") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "ndl-fixed-portal";
    document.documentElement.appendChild(el);
  }
  return el;
}
