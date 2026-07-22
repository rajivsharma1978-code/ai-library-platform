"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";

// primary = the default, repeated action in a list/grid of cards (e.g. one
// per book card) — dark neutral, matching /my-space's own repeated Quick
// Action / Continue Studying buttons (bg-slate-950), NOT the orange brand
// accent. secondary = the neutral alternate action. accent = orange, kept
// for the rare *singular* highlighted action within a view (e.g. the one
// "AI Tutor" toggle in the Normal Reader's toolbar) — orange is
// reserved for cases like that, never repeated across a whole grid.
const VARIANT_CLASSES: Record<AppButtonVariant, string> = {
  primary:   "bg-slate-950 text-white hover:bg-slate-800",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
  ghost:     "bg-transparent text-slate-500 hover:text-slate-800",
  danger:    "bg-red-50 text-red-600 hover:bg-red-100",
  accent:    "bg-orange-600 text-white hover:bg-orange-700",
};

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
  // Additive — does not replace `sm`. Guarantees a 44px minimum regardless
  // of script (Tamil/Telugu glyphs can run taller than Latin/Devanagari),
  // for mobile touch targets per the NDL AI Mobile Design System §4.
  touch: "px-4 py-3 text-sm min-h-[44px]",
};

interface CommonProps {
  variant?: AppButtonVariant;
  size?: keyof typeof SIZE_CLASSES;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

type AppButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AppButtonAsLink = CommonProps & { href: string; onClick?: () => void };

/** One consistent button component for both real buttons and internal
 * links (Standard Mode / AI Tutor / Save / Cancel / etc.),
 * so every page shares the same radius, weight, and variant palette
 * instead of each page inventing its own button classes. */
export default function AppButton(props: AppButtonAsButton | AppButtonAsLink) {
  const { variant = "primary", size = "md", fullWidth, className = "", children } = props;
  const classes = `rounded-xl font-bold text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "block w-full" : "inline-block"} ${className}`;

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} onClick={props.onClick} className={classes}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, fullWidth: _f, className: _c, children: _ch, href: _h, ...buttonProps } = props as AppButtonAsButton;
  return (
    <button {...buttonProps} className={classes}>
      {children}
    </button>
  );
}
