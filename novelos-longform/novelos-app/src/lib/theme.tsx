import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggle: () => {},
});

/** Update the native window appearance to match the theme.
 *  - setTheme() tells macOS to use Dark/Light Appearance for this window
 *    (this controls the title bar color and text color automatically).
 *  - setBackgroundColor() sets the window background behind the webview.
 */
function applyWindowTheme(theme: Theme) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    // Tell macOS to use Dark or Light Appearance for this window
    win.setTheme(theme).catch(() => {});
    // Set window background color: [R, G, B, A] tuple
    const color: [number, number, number, number] = theme === "dark"
      ? [30, 30, 30, 255]
      : [255, 255, 255, 255];
    win.setBackgroundColor(color).catch(() => {});
  }).catch(() => {});
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("novelos-theme");
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("novelos-theme", theme);
    } catch {}
    // Sync native window appearance (title bar color, system controls)
    applyWindowTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
