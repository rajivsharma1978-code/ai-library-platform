"use client";

import { useEffect, useState, useCallback } from "react";
import { LANGUAGE_STORAGE_KEY, type Language } from "./i18n";

const VALID = ["en","hi","ta","bn","te","mr"];

// Module-level subscribers so all instances update instantly on same page
const subscribers = new Set<(l: Language) => void>();

function notifyAll(lang: Language) {
  subscribers.forEach(fn => fn(lang));
}

export function useLanguage(defaultLanguage: Language = "en") {
  const [language, setLanguageState] = useState<Language>(() => {
    // Safe SSR: return default, hydrate on client
    if (typeof window === "undefined") return defaultLanguage;
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (stored && VALID.includes(stored)) ? stored as Language : defaultLanguage;
  });

  useEffect(() => {
    // Sync with localStorage on mount (catches page navigations)
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && VALID.includes(stored) && stored !== language) {
      setLanguageState(stored as Language);
    }

    // Subscribe to in-page changes
    const handler = (lang: Language) => setLanguageState(lang);
    subscribers.add(handler);

    // Also listen to cross-tab storage events
    const storageHandler = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY && e.newValue && VALID.includes(e.newValue)) {
        setLanguageState(e.newValue as Language);
        notifyAll(e.newValue as Language);
      }
    };
    window.addEventListener("storage", storageHandler);

    return () => {
      subscribers.delete(handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    setLanguageState(next);
    notifyAll(next);
  }, []);

  return { language, setLanguage };
}
