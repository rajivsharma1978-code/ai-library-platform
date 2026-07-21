"use client";

import { useEffect, type RefObject } from "react";

// Slow, ambient auto-scroll for a horizontal rail — the Netflix/Apple Books
// "gently drifting shelf" pattern. Ping-pongs between the two ends instead
// of jump-cutting back to the start, since a hard reset is the single
// most distracting thing a background animation can do. Pauses on any
// sign of user intent (hover, touch, wheel, drag) and only resumes after
// a cooldown, so a manual swipe is never fought by the animation — and
// respects prefers-reduced-motion outright.
//
// Uses setInterval rather than requestAnimationFrame deliberately: rAF is
// fully suspended by the browser the instant a tab isn't the visible,
// foregrounded one, which is correct for e.g. a canvas game but means a
// presenter who tabs away for a moment (a very real scenario for a kiosk/
// projector demo) would come back to a shelf that silently stopped
// drifting. A 16ms interval keeps advancing regardless, at the same
// visual rate.
export function useAutoScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean, speed = 0.35) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let direction: 1 | -1 = 1;
    let paused = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const intervalId = setInterval(() => {
      if (paused) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      let next = el.scrollLeft + speed * direction;
      if (next >= max) { next = max; direction = -1; }
      else if (next <= 0) { next = 0; direction = 1; }
      el.scrollLeft = next;
    }, 16);

    const pause = () => {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const scheduleResume = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; }, 2200);
    };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", scheduleResume);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("pointerup", scheduleResume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", scheduleResume);
    el.addEventListener("wheel", () => { pause(); scheduleResume(); }, { passive: true });

    return () => {
      clearInterval(intervalId);
      if (resumeTimer) clearTimeout(resumeTimer);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", scheduleResume);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("pointerup", scheduleResume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", scheduleResume);
    };
  }, [ref, enabled, speed]);
}
