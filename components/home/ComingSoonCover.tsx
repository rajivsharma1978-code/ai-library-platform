// ── Coming-soon book cover art ──────────────────────────────────────
// The Home discovery rails mix a handful of not-yet-available NDL AI
// titles in with the real catalogue (see lib/comingSoonBooks.ts). Two
// earlier versions of this file used illustrated SVG artwork — first
// bright gradient icons, then more restrained line-art emblems — both
// explicitly ruled out: a demo title with no real cover shouldn't be
// wearing invented illustration of any kind, since that reads as "AI
// generated," not "real book." This version has none: a plain, solid
// cloth-bound library-edition treatment — one flat colour, a thin
// embossed-look double rule, and serif title typography — the same
// anatomy as a rebound institutional/reference edition with no dust
// jacket art, which is a real, common category of book, not a stand-in
// for one. No icons, no motifs, no scenes. Rendered as inline SVG (no
// network request, no asset to source); BookCover's own fallback tiers
// are untouched and still used for genuinely missing real covers
// elsewhere in the app.

type Binding = {
  /** Cloth colour. */
  fill: string;
  /** Rule/text ink — light enough to read on `fill`. */
  ink: string;
  lines: string[];
};

const BINDINGS: Record<string, Binding> = {
  "coming-panchatantra": { fill: "#7A2E1E", ink: "#F1E4D3", lines: ["Panchatantra", "Timeless Tales"] },
  "coming-constitution": { fill: "#1B2A44", ink: "#E9E2CC", lines: ["The Constitution", "of India", "A Reader's Guide"] },
  "coming-ramayana": { fill: "#2E2A52", ink: "#E7E1C9", lines: ["Ramayana", "for Young Readers"] },
  "coming-ncert-science": { fill: "#154A46", ink: "#E7E9DE", lines: ["NCERT Science", "Companion"] },
  "coming-classical-music": { fill: "#3B1E3A", ink: "#EADFC8", lines: ["The Art of Indian", "Classical Music"] },
};

const LINE_HEIGHT = 34;
const START_Y = 200;

export function ComingSoonCover({ id, className = "" }: { id: string; className?: string }) {
  const binding = BINDINGS[id];
  if (!binding) return null;
  const { fill, ink, lines } = binding;
  const blockHeight = (lines.length - 1) * LINE_HEIGHT;
  const firstY = START_Y - blockHeight / 2;

  return (
    <div className={`[&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover ${className}`}>
      <svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
        <rect width="300" height="400" fill={fill} />
        <rect x="16" y="16" width="268" height="368" fill="none" stroke={ink} strokeWidth="1" opacity="0.45" />
        <rect x="21" y="21" width="258" height="358" fill="none" stroke={ink} strokeWidth="0.75" opacity="0.3" />
        {lines.map((line, i) => (
          <text
            key={i}
            x="150"
            y={firstY + i * LINE_HEIGHT}
            textAnchor="middle"
            fontFamily="Georgia, 'Noto Serif', serif"
            fontSize={i === 0 ? 25 : 19}
            fontWeight={i === 0 ? 700 : 400}
            fill={ink}
          >
            {line}
          </text>
        ))}
        <line x1="128" y1={firstY + blockHeight + 26} x2="172" y2={firstY + blockHeight + 26} stroke={ink} strokeWidth="1" opacity="0.55" />
        <text x="150" y="368" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="9.5" letterSpacing="3" fill={ink} opacity="0.7">NDL AI</text>
      </svg>
    </div>
  );
}

export default ComingSoonCover;
