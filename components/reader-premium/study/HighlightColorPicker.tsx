"use client";

import { HighlightColor, HIGHLIGHT_COLOR_HEX } from "./studyData";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const ORDER: HighlightColor[] = ["yellow", "green", "blue", "pink"];
const COLOR_ICON: Record<HighlightColor, string> = {
  yellow: "🟡", green: "🟢", blue: "🔵", pink: "🩷",
};

export default function HighlightColorPicker({
  left, top, onPick, onCancel,
}: {
  left: number;
  top: number;
  onPick: (color: HighlightColor) => void;
  onCancel: () => void;
}) {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const COLOR_LABEL: Record<HighlightColor, string> = {
    yellow: t.highlightColorYellow, green: t.highlightColorGreen,
    blue: t.highlightColorBlue, pink: t.highlightColorPink,
  };
  const W = 220;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const PAD = 12;
  const clampedLeft = Math.max(PAD, Math.min(left - W / 2, vw - W - PAD));
  const clampedTop = Math.max(PAD, Math.min(top, vh - 90 - PAD));

  return (
    <div
      className="ndl-fade-in-scale"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: "fixed",
        left: clampedLeft, top: clampedTop,
        width: W,
        zIndex: 220,
        background: "rgba(255,255,255,0.98)",
        border: "1px solid #e5e0d0",
        borderRadius: 16,
        padding: "10px 12px",
        boxShadow: "0 16px 50px rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px)",
        boxSizing: "border-box",
      }}
    >
      <p style={{
        fontSize: 10, fontWeight: 700, color: "#92774a",
        letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8,
      }}>
        {t.highlightColorPickerHeading}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {ORDER.map((c) => (
          <button
            key={c}
            className="ndl-press"
            onClick={() => onPick(c)}
            title={`${COLOR_ICON[c]} ${COLOR_LABEL[c]}`}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: HIGHLIGHT_COLOR_HEX[c].fill,
              border: `2px solid ${HIGHLIGHT_COLOR_HEX[c].border}`,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      <button
        className="ndl-press"
        onClick={onCancel}
        style={{
          marginTop: 8, width: "100%", background: "#f1f0ee", color: "#64748b",
          border: "none", borderRadius: 10, padding: "6px 10px", fontSize: 11,
          fontWeight: 600, cursor: "pointer",
        }}
      >
        {t.commonCancel}
      </button>
    </div>
  );
}
