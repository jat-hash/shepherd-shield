import { useEffect } from "react";

/**
 * ThemeProvider — syncs the app's dark mode with the system preference.
 * Applies/removes the `dark` class on <html> based on prefers-color-scheme.
 * The app is designed dark-first, so this keeps the brand intact while
 * staying in sync with the OS for store-readiness.
 */
export default function ThemeProvider({ children }) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (mq.matches) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return children;
}