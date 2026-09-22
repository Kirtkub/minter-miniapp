"use client";

import { COPY } from "@/lib/copy";

type Tab = "mint" | "collection";

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      <button
        type="button"
        className={tab === "mint" ? "nav-btn active" : "nav-btn"}
        onClick={() => onChange("mint")}
      >
        {COPY.tabs.mint}
      </button>
      <button
        type="button"
        className={tab === "collection" ? "nav-btn active" : "nav-btn"}
        onClick={() => onChange("collection")}
      >
        {COPY.tabs.collection}
      </button>
    </nav>
  );
}
