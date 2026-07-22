"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { MOBILE_NAV_ITEMS, isMobileNavItemActive } from "@/lib/mobileNav";

/** Fixed, always-on primary navigation for phone/tablet widths — hidden
 * at `lg:`, the same breakpoint SiteHeader itself switches from its
 * mobile drawer to the full desktop nav at, so the two never disagree
 * about which one is "the" primary nav for a given width.
 *
 * Mounted exactly once, globally, by MobileNavShell — never per-page.
 * Route data (which 5 tabs, which routes light each one up, which
 * routes hide the bar) lives in lib/mobileNav.ts, not here. */
export default function MobileBottomNav() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label={t.primaryNavLabel}
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden border-t border-slate-100 bg-white/95 backdrop-blur-sm shadow-[0_-8px_24px_rgba(75,45,12,0.08)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isMobileNavItemActive(item.key, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`ndl-press flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold transition-colors ${
                active ? "text-orange-600" : "text-slate-400"
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {item.icon}
              </span>
              <span className="leading-tight">{t[item.labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
