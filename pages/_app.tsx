import type { AppProps } from "next/app";
import { useEffect } from "react";
import TonConnectProvider from "../components/TonConnectProvider";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Dynamically import so this never runs during SSR / build.
    import("@twa-dev/sdk").then(({ default: WebApp }) => {
      try {
        WebApp.ready();
        WebApp.expand();

        const applyThemeVars = () => {
          const p = WebApp.themeParams;
          const root = document.documentElement.style;
          if (p.bg_color) root.setProperty("--tg-theme-bg-color", p.bg_color);
          if (p.text_color) root.setProperty("--tg-theme-text-color", p.text_color);
          if (p.hint_color) root.setProperty("--tg-theme-hint-color", p.hint_color);
          if (p.link_color) root.setProperty("--tg-theme-link-color", p.link_color);
          if (p.button_color) root.setProperty("--tg-theme-button-color", p.button_color);
          if (p.button_text_color)
            root.setProperty("--tg-theme-button-text-color", p.button_text_color);
          if (p.secondary_bg_color)
            root.setProperty("--tg-theme-secondary-bg-color", p.secondary_bg_color);
        };

        applyThemeVars();
        WebApp.onEvent("themeChanged", applyThemeVars);
        WebApp.setHeaderColor("secondary_bg_color");
        WebApp.setBackgroundColor(
          (WebApp.themeParams.bg_color as `#${string}`) ?? "#0f0f12"
        );
      } catch (err) {
        // Not running inside Telegram (e.g. local dev in a plain browser) —
        // the app still works standalone with the CSS fallback theme values.
        console.warn("Telegram WebApp SDK unavailable:", err);
      }
    });
  }, []);

  return <Component {...pageProps} />;
}
