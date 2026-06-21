"use client";

type ReaderToolbarProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReadAloud: () => void;
  onToggleTheme: () => void;
  onFullscreen: () => void;
};

export default function ReaderToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReadAloud,
  onToggleTheme,
  onFullscreen,
}: ReaderToolbarProps) {
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

      <button onClick={onReadAloud} className="rounded-xl border px-3 py-2 text-sm">
        🔊 Read
      </button>

      <button onClick={onToggleTheme} className="rounded-xl border px-3 py-2 text-sm">
        🌙
      </button>

      <button onClick={onFullscreen} className="rounded-xl border px-3 py-2 text-sm">
        ⛶
      </button>
    </div>
  );
}