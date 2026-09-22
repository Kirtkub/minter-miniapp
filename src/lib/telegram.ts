"use client";

import { useEffect } from "react";

export function TelegramBoot() {
  useEffect(() => {
    void import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        WebApp.ready();
        WebApp.expand();
        if (
          "disableVerticalSwipes" in WebApp &&
          typeof WebApp.disableVerticalSwipes === "function"
        ) {
          WebApp.disableVerticalSwipes();
        }
        WebApp.setHeaderColor("secondary_bg_color");
        WebApp.setBackgroundColor("bg_color");
      })
      .catch(() => {
        // Running outside Telegram is supported for local development.
      });
  }, []);
  return null;
}
