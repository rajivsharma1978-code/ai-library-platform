"use client";

import { useState } from "react";

export type NoteAIAction = "expand" | "simplify" | "exam" | "revision";

const AI_ACTIONS: { action: NoteAIAction; label: string }[] = [
  { action: "expand",   label: "Expand note" },
  { action: "simplify", label: "Simplify" },
  { action: "exam",     label: "Make exam notes" },
  { action: "revision", label: "Create revision notes" },
];

export default function NotePopover({
  left, top, initialText, selectedTextPreview,
  onSave, onCancel, onImprove, improving,
}: {
  left: number;
  top: number;
  initialText: string;
  selectedTextPreview: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  onImprove: (action: NoteAIAction, currentText: string) => Promise<string>;
  improving: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [showAiMenu, setShowAiMenu] = useState(false);

  const POPOVER_W = 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const PAD = 12;
  const clampedLeft = Math.max(PAD, Math.min(left - POPOVER_W / 2, vw - POPOVER_W - PAD));
  const clampedTop = Math.max(PAD, Math.min(top, vh - 260 - PAD));

  async function handleImprove(action: NoteAIAction) {
    setShowAiMenu(false);
    const improved = await onImprove(action, text);
    if (improved) setText(improved);
  }

  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: "fixed",
        left: clampedLeft, top: clampedTop,
        width: POPOVER_W,
        zIndex: 220,
        background: "rgba(255,255,255,0.98)",
        border: "1px solid #e5e0d0",
        borderRadius: 18,
        padding: "12px 14px",
        boxShadow: "0 16px 50px rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px)",
        boxSizing: "border-box",
      }}
    >
      <p style={{
        fontSize: 11, fontWeight: 700, color: "#92774a",
        letterSpacing: "0.05em", textTransform: "uppercase",
        marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        📝 Note on “{selectedTextPreview.slice(0, 36)}{selectedTextPreview.length > 36 ? "…" : ""}”
      </p>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your note…"
        rows={4}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          borderRadius: 10, border: "1px solid #d9d2bd", padding: "8px 10px",
          fontSize: 13, outline: "none", fontFamily: "inherit", lineHeight: 1.5,
        }}
      />

      <div style={{ position: "relative", marginTop: 8 }}>
        <button
          onClick={() => setShowAiMenu(v => !v)}
          disabled={improving || !text.trim()}
          style={{
            width: "100%", background: "#334155", color: "#e2e8f0", border: "none",
            borderRadius: 10, padding: "7px 10px", fontSize: 12, fontWeight: 700,
            cursor: improving ? "default" : "pointer", opacity: improving || !text.trim() ? 0.5 : 1,
            textAlign: "left",
          }}
        >
          {improving ? "✨ Improving…" : "✨ Improve with AI"}
        </button>

        {showAiMenu && !improving && (
          <div style={{
            position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)",
            background: "#fff", border: "1px solid #e5e0d0", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", overflow: "hidden", zIndex: 5,
          }}>
            {AI_ACTIONS.map(({ action, label }) => (
              <button
                key={action}
                onClick={() => handleImprove(action)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: "none", border: "none", borderBottom: "1px solid #f1eee4",
                  padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#334155",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          onClick={() => onSave(text)}
          disabled={!text.trim()}
          style={{
            flex: 1, background: "#0f172a", color: "#fff", border: "none",
            borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", opacity: text.trim() ? 1 : 0.4,
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "#f1f0ee", color: "#64748b", border: "none",
            borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
