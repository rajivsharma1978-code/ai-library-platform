// ── Mobile bottom navigation — centralized route data ──────────────────
// Single source of truth for the 5 primary tabs, their active-state
// matching, and which routes hide the bar entirely (Reader/Admin — full-
// bleed, immersive surfaces where a persistent bottom bar would compete
// with the content itself). Consumed by MobileBottomNav (rendering) and
// MobileNavShell (show/hide + content padding), so both always agree —
// no page should ever need its own copy of this logic.

import type { UI_TEXT } from "./i18n";

export type MobileNavKey = "home" | "explore" | "library" | "learn" | "profile";

export interface MobileNavItem {
  key: MobileNavKey;
  href: string;
  icon: string;
  labelKey: keyof typeof UI_TEXT["en"];
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { key: "home", href: "/", icon: "🏠", labelKey: "commonHome" },
  { key: "explore", href: "/explore", icon: "🗺️", labelKey: "navExplore" },
  { key: "library", href: "/library", icon: "📚", labelKey: "navLibrary" },
  { key: "learn", href: "/learn", icon: "🧠", labelKey: "navLearn" },
  { key: "profile", href: "/settings", icon: "⚙️", labelKey: "navProfile" },
];

// Every route (beyond its own tab href, which is always checked) that
// should light up a given tab. Home deliberately has none — it is only
// ever active on the exact "/" route, never on a prefix.
const LIBRARY_EXTRA_ROUTES = ["/book"];
const LEARN_ROUTES = [
  "/learn", "/my-books", "/my-library", "/notes", "/revision",
  "/flashcards", "/quiz", "/analytics", "/ai-tutor",
];
const PROFILE_ROUTES = ["/settings", "/sign-in"];

// Exact match, or a nested path under it ("/book/nalanda" matches
// "/book", "/my-books/x" matches "/my-books") — never a bare-prefix
// collision ("/my-books" must not match "/my-books-extra").
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isMobileNavItemActive(key: MobileNavKey, pathname: string): boolean {
  switch (key) {
    case "home":
      return pathname === "/";
    case "explore":
      return matchesRoute(pathname, "/explore");
    case "library":
      return matchesRoute(pathname, "/library") || LIBRARY_EXTRA_ROUTES.some(r => matchesRoute(pathname, r));
    case "learn":
      return LEARN_ROUTES.some(r => matchesRoute(pathname, r));
    case "profile":
      return PROFILE_ROUTES.some(r => matchesRoute(pathname, r));
    default:
      return false;
  }
}

// Routes where the bottom nav is hidden entirely — every Admin surface
// (AdminSidebar is the nav there) and every Reader surface (Standard
// Mode, Premium/AI Tutor, and the legacy/experimental reader variants).
// Confirmed against the actual app/ route tree: app/read, app/reader,
// app/reader-premium, app/reader-premium-v2, app/admin/**, app/admin-login
// are all single-segment routes with no nested dynamic children, so an
// exact-or-nested-path match is sufficient — no guessing.
const HIDDEN_ROUTE_PREFIXES = [
  "/admin",
  "/admin-login",
  "/read",
  "/reader",
  "/reader-premium",
  "/reader-premium-v2",
];

export function shouldShowMobileBottomNav(pathname: string): boolean {
  return !HIDDEN_ROUTE_PREFIXES.some(r => matchesRoute(pathname, r));
}
