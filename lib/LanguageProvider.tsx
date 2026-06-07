"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LANGUAGE_STORAGE_KEY, type Language } from "./i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && ["en","hi","ta","bn","te","mr"].includes(stored)) {
      setLanguageState(stored as Language);
    }
    // Listen for changes from other tabs / components
    const handler = () => {
      const updated = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (updated && ["en","hi","ta","bn","te","mr"].includes(updated)) {
        setLanguageState(updated as Language);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    // Dispatch storage event so all components re-render
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext() {
  return useContext(LanguageContext);
}
