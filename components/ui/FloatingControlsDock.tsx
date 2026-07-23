"use client";

// ── Floating Controls Dock ──────────────────────────────────────────────
// Groups the Accessibility Toolbar's ♿ button and Voice Assistant's 🎙️
// button into ONE draggable stack, instead of two independently
// fixed-position floating buttons that can drift on top of page content.
//
// Drag model:
//   - Only elements marked [data-dock-handle] (the two trigger buttons)
//     can START a drag — panel content (sliders, color pickers, close
//     buttons, the mic transcript panel, etc.) is completely untouched,
//     so a press-and-drag on a slider thumb is never hijacked into
//     moving the whole dock. This is also how "keep functionality
//     unchanged" is satisfied without editing either button's onClick.
//   - Press-and-HOLD a handle for ~300ms before any movement counts as a
//     drag; a quick tap always falls through as a normal click (opens
//     the panel / starts listening), because we only ever intercept the
//     click when a real drag with real movement just happened.
//   - On release, the dock snaps to whichever viewport edge is nearest,
//     animates there, and the final position is persisted. Collision
//     avoidance then nudges it along that edge if it would overlap a
//     protected region (see getProtectedRects below).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFixedPortalRoot } from "@/lib/fixedPortal";

const STORAGE_KEY = "ndl_floating_dock_position";
const HOLD_MS = 300;
const DRAG_MOVE_THRESHOLD = 4; // px — real movement required before a hold becomes a drag
const EDGE_MARGIN = 14; // gap kept from the viewport edge, both while dragging and when snapped
const COLLISION_STEP = 24;

interface Point { x: number; y: number; }

function clampPoint(pos: Point, w: number, h: number, vw: number, vh: number): Point {
  const maxX = Math.max(EDGE_MARGIN, vw - w - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, vh - h - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(pos.x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(pos.y, EDGE_MARGIN), maxY),
  };
}

function snapToNearestEdge(pos: Point, w: number, h: number, vw: number, vh: number): Point {
  const distLeft = pos.x;
  const distRight = vw - (pos.x + w);
  const distTop = pos.y;
  const distBottom = vh - (pos.y + h);
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return clampPoint({ x: EDGE_MARGIN, y: pos.y }, w, h, vw, vh);
  if (min === distRight) return clampPoint({ x: vw - w - EDGE_MARGIN, y: pos.y }, w, h, vw, vh);
  if (min === distTop) return clampPoint({ x: pos.x, y: EDGE_MARGIN }, w, h, vw, vh);
  return clampPoint({ x: pos.x, y: vh - h - EDGE_MARGIN }, w, h, vw, vh);
}

function rectsOverlap(a: DOMRect, box: { x: number; y: number; width: number; height: number }): boolean {
  return !(box.x + box.width < a.left || box.x > a.right || box.y + box.height < a.top || box.y > a.bottom);
}

// Curated, extensible protected-zone list — real "important controls"
// (AI input, page navigation) opt in via [data-dock-avoid]; header/footer
// are covered generically since most page chrome lives there.
function getProtectedRects(): DOMRect[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll("header, footer, [data-dock-avoid]"))
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0);
}

function resolveCollision(pos: Point, w: number, h: number, vw: number, vh: number): Point {
  const rects = getProtectedRects();
  if (!rects.length) return pos;
  const overlaps = (p: Point) => rects.some(r => rectsOverlap(r, { x: p.x, y: p.y, width: w, height: h }));
  if (!overlaps(pos)) return pos;

  // Snapped to a vertical edge (left/right) → slide along Y; snapped to a
  // horizontal edge (top/bottom) → slide along X.
  const onVerticalEdge = pos.x <= EDGE_MARGIN + 1 || pos.x >= vw - w - EDGE_MARGIN - 1;
  const axisMax = onVerticalEdge ? vh : vw;
  for (let d = COLLISION_STEP; d < axisMax; d += COLLISION_STEP) {
    for (const dir of [1, -1]) {
      const candidate = clampPoint(
        onVerticalEdge ? { x: pos.x, y: pos.y + dir * d } : { x: pos.x + dir * d, y: pos.y },
        w, h, vw, vh
      );
      if (!overlaps(candidate)) return candidate;
    }
  }
  return pos; // nothing clear found — keep the original rather than hide it somewhere worse
}

export default function FloatingControlsDock({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const [animate, setAnimate] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const justDraggedRef = useRef(false);
  const drag = useRef({
    startX: 0, startY: 0, origX: 0, origY: 0,
    armed: false, dragging: false, moved: false,
    pointerId: null as number | null,
    handleEl: null as Element | null,
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  function measuredSize() {
    return {
      w: containerRef.current?.offsetWidth || 56,
      h: containerRef.current?.offsetHeight || 56,
    };
  }
  function defaultPosition(): Point {
    const { w, h } = measuredSize();
    return { x: window.innerWidth - w - EDGE_MARGIN, y: window.innerHeight - h - EDGE_MARGIN };
  }
  function persist(p: Point) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  }

  // The portal root must exist and actually be rendered into (see the
  // createPortal call below) BEFORE containerRef has a real node to
  // measure — so this runs first, and the restore effect below only
  // proceeds once portalRoot is set.
  useEffect(() => {
    setPortalRoot(getFixedPortalRoot());
  }, []);

  // Restore saved position (or default) once we can measure real size.
  useEffect(() => {
    if (!portalRoot) return;
    const { w, h } = measuredSize();
    let initial: Point;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      initial = raw ? JSON.parse(raw) : defaultPosition();
    } catch { initial = defaultPosition(); }
    initial = clampPoint(initial, w, h, window.innerWidth, window.innerHeight);
    initial = resolveCollision(initial, w, h, window.innerWidth, window.innerHeight);
    setPos(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalRoot]);

  // Re-clamp + re-check collisions when the viewport (or page layout)
  // changes size, so the dock never ends up stranded off-screen or stuck
  // under a control that only appeared after a resize/orientation change.
  useEffect(() => {
    function onResize() {
      setPos(prev => {
        if (!prev) return prev;
        const { w, h } = measuredSize();
        const clamped = clampPoint(prev, w, h, window.innerWidth, window.innerHeight);
        return resolveCollision(clamped, w, h, window.innerWidth, window.innerHeight);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest("[data-dock-handle]");
    if (!handle) return; // not a press on a drag handle — ignore entirely
    const d = drag.current;
    d.startX = e.clientX; d.startY = e.clientY;
    d.origX = pos?.x ?? 0; d.origY = pos?.y ?? 0;
    d.armed = false; d.dragging = false; d.moved = false;
    d.pointerId = e.pointerId;
    d.handleEl = handle;
    try { (handle as Element).setPointerCapture(e.pointerId); } catch {}
    if (d.timer) clearTimeout(d.timer);
    d.timer = setTimeout(() => { d.armed = true; }, HOLD_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (d.pointerId !== e.pointerId || !d.armed) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging && (Math.abs(dx) > DRAG_MOVE_THRESHOLD || Math.abs(dy) > DRAG_MOVE_THRESHOLD)) {
      d.dragging = true;
      setAnimate(false);
    }
    if (d.dragging) {
      d.moved = true;
      const { w, h } = measuredSize();
      setPos(clampPoint({ x: d.origX + dx, y: d.origY + dy }, w, h, window.innerWidth, window.innerHeight));
      // Lets a panel that's still open (AccessibilityToolbar's settings
      // panel, VoiceAssistant's panel) keep re-anchoring to the trigger
      // button while it's being dragged, instead of being left behind.
      window.dispatchEvent(new CustomEvent("ndl-dock-moved"));
    }
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    if (d.pointerId === e.pointerId && d.dragging && d.moved) {
      const { w, h } = measuredSize();
      setAnimate(true);
      setPos(prev => {
        const current = prev ?? { x: d.origX, y: d.origY };
        let snapped = snapToNearestEdge(current, w, h, window.innerWidth, window.innerHeight);
        snapped = resolveCollision(snapped, w, h, window.innerWidth, window.innerHeight);
        persist(snapped);
        window.dispatchEvent(new CustomEvent("ndl-dock-moved"));
        return snapped;
      });
      justDraggedRef.current = true;
    }
    try { d.handleEl && (d.handleEl as Element).releasePointerCapture(e.pointerId); } catch {}
    d.armed = false; d.dragging = false; d.moved = false; d.pointerId = null; d.handleEl = null;
  }

  // Swallows the synthetic click that follows a real drag's pointerup, so
  // the button's own onClick (open panel / start listening) doesn't also
  // fire right after a drag. A tap that never moved never sets this flag,
  // so ordinary clicks reach the button completely untouched.
  function handleClickCapture(e: React.MouseEvent) {
    if (justDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      justDraggedRef.current = false;
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).closest("[data-dock-handle]")) return;
    e.preventDefault();
    const def = defaultPosition();
    const { w, h } = measuredSize();
    const clamped = clampPoint(def, w, h, window.innerWidth, window.innerHeight);
    setAnimate(true);
    setPos(clamped);
    persist(clamped);
  }

  // Before the restored position is known, render off-screen-but-measured
  // (opacity 0) so containerRef has real dimensions the moment the
  // restore effect runs — avoids ever flashing at the wrong spot.
  const ready = pos !== null;

  if (!portalRoot) return null; // SSR + the first client tick, before the portal target exists

  return createPortal(
    <div
      ref={containerRef}
      data-a11y-no-invert
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "fixed",
        left: ready ? pos!.x : undefined,
        top: ready ? pos!.y : undefined,
        bottom: ready ? undefined : EDGE_MARGIN,
        right: ready ? undefined : EDGE_MARGIN,
        opacity: ready ? 1 : 0,
        pointerEvents: ready ? "auto" : "none",
        zIndex: 9999,
        transition: animate ? "left 260ms cubic-bezier(0.22,1,0.36,1), top 260ms cubic-bezier(0.22,1,0.36,1)" : "none",
      }}
      // Phase C1C: margin-based spacing instead of flexbox `gap` — `gap`
      // on a flex container isn't supported in Safari < 14.1 (an older
      // iPhone can easily still be on that), where it silently collapses
      // to 0 instead of degrading gracefully, leaving the ♿ and 🎙️
      // triggers flush/overlapping. `[&>*+*]:mt-3` (margin-top on every
      // child after the first) gives the same 12px stacking gap through
      // plain margins, which every browser supports.
      className="flex flex-col items-end [&>*+*]:mt-3"
    >
      {children}
    </div>,
    portalRoot
  );
}
