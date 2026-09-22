import { useEffect, useState } from "react";

interface Props {
  targetDate: string; // ISO-8601 UTC
  onEnd?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00d 00h 00m 00s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

export default function CountdownTimer({ targetDate, onEnd }: Props) {
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    new Date(targetDate).getTime() - Date.now()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = new Date(targetDate).getTime() - Date.now();
      setRemainingMs(diff);
      if (diff <= 0) {
        clearInterval(interval);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onEnd]);

  const ended = remainingMs <= 0;

  return (
    <span className={`countdown ${ended ? "ended" : ""}`}>
      {ended ? "Minting ended" : `Ends in ${formatRemaining(remainingMs)}`}
    </span>
  );
}
