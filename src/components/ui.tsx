"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const dd = String(days).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${dd}d ${hh}h ${mm}m ${ss}s`;
}

export function Countdown({ endMs }: { endMs: number }) {
  const [label, setLabel] = useState(() => formatRemaining(endMs - Date.now()));

  useEffect(() => {
    const tick = () => setLabel(formatRemaining(endMs - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endMs]);

  return <span className="countdown">{label}</span>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="status-row" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <article className="card">
      <div className="skeleton image-skeleton" />
      <div className="skeleton line" />
      <div className="skeleton line short" />
    </article>
  );
}
