"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_STORAGE_KEY, type Language } from "./i18n";

export function useLanguage(defaultLanguage: Language = "en") {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);

  useEffect(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && ["en", "hi", "ta", "bn", "te", "mr"].includes(stored)) {
      setLanguageState(stored as Language);
    }
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  };

  return { language, setLanguage };
}
