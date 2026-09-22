export type AppTab = "mint" | "collection";

interface Props {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" role="tablist" aria-label="Main navigation">
      <button
        role="tab"
        aria-selected={active === "mint"}
        className={active === "mint" ? "active" : ""}
        onClick={() => onChange("mint")}
      >
        <span className="icon" aria-hidden>
          🔥
        </span>
        Mint Spicy Pic
      </button>
      <button
        role="tab"
        aria-selected={active === "collection"}
        className={active === "collection" ? "active" : ""}
        onClick={() => onChange("collection")}
      >
        <span className="icon" aria-hidden>
          🖼️
        </span>
        My Collection
      </button>
    </nav>
  );
}
