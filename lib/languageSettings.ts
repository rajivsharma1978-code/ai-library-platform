// ── Public language-availability helper ─────────────────────────────────
// Makes Admin → Languages' Enabled/Disabled toggle actually control which
// languages are offered anywhere the public app lets someone pick one —
// not just a cosmetic badge on the admin page. Reads the same
// ndl_admin_languages key + loadLanguageSettings() the Admin module
// already uses.
//
// Client-only: reads localStorage, so (like lib/catalog.ts) it must never
// be called during SSR or a component's first (hydration) render —
// callers gate it behind their own mount check, or use the hook below.

"use client";

import { useEffect, useState } from "react";
import { loadLanguageSettings } from "@/components/admin/adminData";
import type { Language } from "@/lib/i18n";

// Admin language settings are stored by display name ("English", "Hindi",
// …) since that's what Book Management's language dropdown also uses —
// this maps them to the Language codes lib/i18n.ts / useLanguage.ts use.
export const LANGUAGE_NAME_TO_CODE: Record<string, Language> = {
  English: "en", Hindi: "hi", Tamil: "ta", Bengali: "bn", Marathi: "mr", Telugu: "te",
};
const ALL_CODES: Language[] = ["en", "hi", "ta", "bn", "te", "mr"];

/** Which language codes are currently enabled. Always returns at least
 *  one (falls back to every language if an admin somehow disabled all
 *  six, so the site can never end up with zero selectable languages). */
export function getEnabledLanguageCodes(): Language[] {
  const settings = loadLanguageSettings();
  const codes = settings
    .filter(s => s.enabled)
    .map(s => LANGUAGE_NAME_TO_CODE[s.language])
    .filter((c): c is Language => !!c);
  return codes.length > 0 ? codes : ALL_CODES;
}

/** Hydration-safe hook — returns every language during SSR and the
 *  client's first (hydration) render (identical to today's behavior, so
 *  it can never cause a mismatch), then narrows to the real enabled set
 *  in a useEffect, strictly after hydration. */
export function useEnabledLanguages(): Language[] {
  const [codes, setCodes] = useState<Language[]>(ALL_CODES);
  useEffect(() => {
    setCodes(getEnabledLanguageCodes());
  }, []);
  return codes;
}
