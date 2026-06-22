"use client";

export type SpeechState = "idle" | "loading" | "playing" | "paused";

type ReaderToolbarProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  // Single toggle handler: PremiumReaderV2 decides what this means
  // based on the current speechState (idle→start, playing→pause,
  // paused→resume) — ReaderToolbar just reports the click.
  onReadAloud: () => void;
  // Only called when the Stop button is visible (playing or paused).
  onStopReadAloud: () => void;
  onToggleTheme: () => void;
  onFullscreen: () => void;
  speechState: SpeechState;
};

const READ_BUTTON_LABEL: Record<SpeechState, string> = {
  idle: "🔊 Read",
  loading: "⏳ Reading…",
  playing: "⏸ Pause",
  paused: "▶ Resume",
};

export default function ReaderToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReadAloud,
  onStopReadAloud,
  onToggleTheme,
  onFullscreen,
  speechState,
}: ReaderToolbarProps) {
  const showStop = speechState === "playing" || speechState === "paused";

  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#e3dcc9] bg-white/80 px-3 py-2 shadow-sm">
      <button onClick={onZoomOut} className="rounded-xl border px-3 py-2 text-sm">
        −
      </button>

      <span className="min-w-14 text-center text-sm font-semibold">
        {zoom}%
      </span>

      <button onClick={onZoomIn} className="rounded-xl border px-3 py-2 text-sm">
        +
      </button>

      <button onClick={onFit} className="rounded-xl border px-3 py-2 text-sm">
        Fit
      </button>

      <button
        onClick={onReadAloud}
        disabled={speechState === "loading"}
        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
      >
        {READ_BUTTON_LABEL[speechState]}
      </button>

      {showStop && (
        <button
          onClick={onStopReadAloud}
          className="rounded-xl border px-3 py-2 text-sm text-red-700"
        >
          ⏹ Stop
        </button>
      )}

      <button onClick={onToggleTheme} className="rounded-xl border px-3 py-2 text-sm">
        🌙
      </button>

      <button onClick={onFullscreen} className="rounded-xl border px-3 py-2 text-sm">
        ⛶
      </button>
    </div>
  );
}
