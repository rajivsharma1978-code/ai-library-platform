"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_STORAGE_KEY, type Language } from "./i18n";

export function useLanguage(defaultLanguage: Language = "en") {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);

  useEffect(() => {
    const read = () => {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && ["en","hi","ta","bn","te","mr"].includes(stored)) {
        setLanguageState(stored as Language);
      }
    };
    read();
    // Re-read whenever any component changes the language
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    // Notify all other components on this page
    window.dispatchEvent(new Event("storage"));
  };

  return { language, setLanguage };
}
