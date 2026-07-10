"use client";

// ── Adaptive panel placement ─────────────────────────────────────────
// Used by the Accessibility Toolbar's and Voice Assistant's popover
// panels inside the draggable FloatingControlsDock. Since the dock can
// now be dragged to any of the four screen edges, a panel that always
// expands "upward from the trigger" (the old assumption, back when the
// dock only ever lived in the bottom-right corner) can render partly or
// fully off-screen once the dock is near the top, left, or right edge
// instead. This computes where the panel should actually go, given the
// trigger button's real on-screen position.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DEFAULT_MARGIN = 14; // 12–16px viewport margin, per the requirement
const GAP = 8; // gap between the trigger button and the panel

export interface PanelPlacement {
  top: number;
  left: number;
  maxHeight: number;
  maxWidth: number;
}

export function computePanelPlacement(
  triggerRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
  margin = DEFAULT_MARGIN
): PanelPlacement {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  // Vertical: near the bottom → expand upward; near the top → expand
  // downward. "Near the bottom" is decided by which side actually has
  // room, not just which half of the screen the trigger sits in, so a
  // short panel near the middle of a tall screen still opens on its
  // natural (usually downward) side.
  const spaceAbove = triggerRect.top;
  const spaceBelow = vh - triggerRect.bottom;
  const expandUp = spaceBelow < panelHeight + GAP + margin && spaceAbove > spaceBelow;

  // Horizontal: near the right edge → expand left; near the left edge →
  // expand right.
  const expandLeft = triggerRect.left > vw / 2;

  let top = expandUp ? triggerRect.top - GAP - panelHeight : triggerRect.bottom + GAP;
  let left = expandLeft ? triggerRect.right - panelWidth : triggerRect.left;

  // Clamp fully inside the viewport, with margin, as a hard floor/ceiling
  // — this is what guarantees the panel never renders below the screen
  // or beyond the right edge even in a corner where neither preferred
  // direction leaves quite enough room; the panel shifts to whatever
  // position keeps it fully visible instead.
  const maxTop = Math.max(margin, vh - panelHeight - margin);
  const maxLeft = Math.max(margin, vw - panelWidth - margin);
  top = Math.min(Math.max(top, margin), maxTop);
  left = Math.min(Math.max(left, margin), maxLeft);

  return {
    top,
    left,
    maxHeight: Math.max(120, vh - margin * 2),
    maxWidth: Math.max(200, vw - margin * 2),
  };
}

// Measure-then-place: the panel first mounts invisibly (visibility:
// hidden, still in normal layout) so panelRef has a real size, a
// useLayoutEffect computes the placement BEFORE the browser paints (so
// there's never a visible flash at the wrong spot), and only then does
// the panel become visible. Recomputes on window resize and whenever
// the dock itself moves (FloatingControlsDock broadcasts
// "ndl-dock-moved" while dragging) — a panel left open mid-drag keeps
// tracking its trigger instead of being left behind.
export function useAdaptivePanelPlacement(open: boolean, fallbackWidth: number) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);

  function recompute() {
    if (!triggerRef.current || !panelRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const width = panelRect.width || fallbackWidth;
    const height = panelRect.height || 200;
    setPlacement(computePanelPlacement(triggerRect, width, height));
  }

  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return; }
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => recompute()) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    function onChange() { recompute(); }
    window.addEventListener("resize", onChange);
    window.addEventListener("ndl-dock-moved", onChange);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onChange);
      window.removeEventListener("ndl-dock-moved", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { triggerRef, panelRef, placement };
}
