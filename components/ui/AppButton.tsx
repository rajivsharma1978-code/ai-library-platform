"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";

const VARIANT_CLASSES: Record<AppButtonVariant, string> = {
  primary:   "bg-black text-white hover:bg-slate-800",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  ghost:     "bg-transparent text-slate-500 hover:text-slate-800",
  danger:    "bg-red-50 text-red-600 hover:bg-red-100",
  accent:    "bg-purple-600 text-white hover:bg-purple-700",
};

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
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
 * links (Read Normally / Read with AI Tutor / Save / Cancel / etc.),
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
