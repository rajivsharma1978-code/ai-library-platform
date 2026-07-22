"use client";

import { usePathname } from "next/navigation";
import MobileBottomNav from "./MobileBottomNav";
import { shouldShowMobileBottomNav } from "@/lib/mobileNav";

/** Single global mount point for the mobile bottom nav — wrapped around
 * every page from the root layout, so no individual page has to remember
 * to render it or reserve space above it.
 *
 * Reader/Admin routes (shouldShowMobileBottomNav === false) render
 * children completely unwrapped — no extra div, no padding, byte-for-byte
 * what today's markup already is — so this can never affect those
 * routes' existing full-bleed layouts.
 *
 * Nav-eligible routes get one shared wrapper div reserving space for the
 * fixed bar (56px content height + safe-area inset, zeroed out again at
 * `lg:` where the bar itself is hidden) instead of every page adding its
 * own bottom padding independently. */
export default function MobileNavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const showNav = shouldShowMobileBottomNav(pathname);

  if (!showNav) return <>{children}</>;

  return (
    <>
      <div className="pb-[calc(56px_+_env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      <MobileBottomNav />
    </>
  );
}
