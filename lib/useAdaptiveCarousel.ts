"use client";

// ── Adaptive carousel rail ───────────────────────────────────────────
// A horizontal book rail (Director Collection, Featured Books, New
// Arrivals) is built as a scrollable carousel so it keeps working once
// the catalogue holds hundreds of books. But with only a handful of
// items — like the current demo catalogue — a left-aligned scrollable
// row just leaves a lopsided gap of empty space on the right, which
// reads as "missing content" rather than "curated collection."
//
// This measures whether the rail's content actually overflows its
// container. Callers use that to switch between two presentations of
// the exact same markup — centered/no-arrows when everything already
// fits, left-aligned/scrollable/arrows when it doesn't — instead of
// keeping two different layouts in sync by hand. As real content grows
// past the container width, this flips back to carousel mode on its
// own; no redesign needed.

import { useLayoutEffect, useRef, useState } from "react";

export function useAdaptiveCarousel<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);

  // useLayoutEffect (not useEffect) so the first real measurement happens
  // before paint — otherwise the row would flash left-aligned-with-arrows
  // for one frame before settling into centered mode.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // A block-level flex container always reports scrollWidth === clientWidth
    // when its children are narrower than it (no shrink-to-fit), so that
    // comparison can't detect "content is smaller than the row" — it only
    // ever detects genuine overflow. Instead, measure how far the last
    // child's right edge actually extends past the container's own left
    // edge, in viewport coordinates (robust regardless of offsetParent).
    const check = () => {
      const last = el.lastElementChild as HTMLElement | null;
      if (!last) { setOverflowing(false); return; }
      const elRect = el.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      setOverflowing(lastRect.right - elRect.left > elRect.width + 1);
    };
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, overflowing };
}
