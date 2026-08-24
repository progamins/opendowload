interface WaveformProgressProps {
  percent: number;
  active: boolean;
  tone?: "amber" | "teal" | "danger";
}

const BAR_COUNT = 28;

/**
 * The signature visual element of the app: instead of a flat progress bar,
 * downloads fill a row of vertical bars like a studio VU meter / waveform.
 * Bars below the current percentage are lit; the leading bar pulses while
 * the transfer is active.
 */
export function WaveformProgress({ percent, active, tone = "amber" }: WaveformProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const litCount = Math.round((clamped / 100) * BAR_COUNT);

  const litColor =
    tone === "danger" ? "bg-danger-500" : tone === "teal" ? "bg-teal-500" : "bg-amber-500";

  // Deterministic pseudo-random-ish heights so it reads as a waveform, not a bar chart.
  const heights = Array.from({ length: BAR_COUNT }, (_, i) => {
    const wave = Math.sin(i * 0.9) * 0.5 + Math.sin(i * 0.35) * 0.5;
    return 35 + Math.abs(wave) * 55;
  });

  return (
    <div className="flex h-8 items-end gap-[3px]" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      {heights.map((h, i) => {
        const isLit = i < litCount;
        const isLeading = isLit && i === litCount - 1 && active;
        return (
          <div
            key={i}
            className={`w-full rounded-sm transition-colors duration-300 ${
              isLit ? litColor : "bg-graphite-600"
            } ${isLeading ? "animate-pulse" : ""}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}
