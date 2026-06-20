export interface FitResult {
  width: number;
  height: number;
  scale: number;
}

/**
 * Computes the largest width/height that fits `naturalW x naturalH`
 * inside `availW x availH` while preserving aspect ratio exactly
 * (object-contain behaviour — never stretches, never crops).
 */
export function fitContain(
  naturalW: number,
  naturalH: number,
  availW: number,
  availH: number
): FitResult {
  if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  const naturalAspect = naturalW / naturalH;
  const availAspect = availW / availH;

  let width: number;
  let height: number;

  if (naturalAspect > availAspect) {
    // Natural content is relatively wider — width-bound.
    width = availW;
    height = availW / naturalAspect;
  } else {
    // Natural content is relatively taller — height-bound.
    height = availH;
    width = availH * naturalAspect;
  }

  const scale = width / naturalW;
  return { width: Math.floor(width), height: Math.floor(height), scale };
}

/**
 * Computes fit dimensions for a double-spread: two pages side by side
 * with a center gutter, fit as a combined unit into the available area.
 * Both pages are scaled by the SAME factor (so they look like one
 * continuous physical book), based on the taller/wider combined bounds.
 */
export function fitContainSpread(
  leftW: number,
  leftH: number,
  rightW: number,
  rightH: number,
  availW: number,
  availH: number,
  gutterPx: number
): {
  scale: number;
  leftWidth: number;
  leftHeight: number;
  rightWidth: number;
  rightHeight: number;
  totalWidth: number;
  totalHeight: number;
} {
  // Use the taller of the two natural heights as the common page height
  // so both pages align along the spine, matching real book behaviour.
  const commonNaturalHeight = Math.max(leftH, rightH);

  // Scale each page's width proportionally to the common height so the
  // pair, when placed side by side, has total natural width:
  const leftScaledW = (commonNaturalHeight / leftH) * leftW;
  const rightScaledW = (commonNaturalHeight / rightH) * rightW;

  const combinedNaturalW = leftScaledW + rightScaledW + gutterPx;
  const combinedNaturalH = commonNaturalHeight;

  const fit = fitContain(combinedNaturalW, combinedNaturalH, availW, availH);
  const scale = fit.scale;

  return {
    scale,
    leftWidth: Math.floor(leftScaledW * scale),
    leftHeight: Math.floor(commonNaturalHeight * scale),
    rightWidth: Math.floor(rightScaledW * scale),
    rightHeight: Math.floor(commonNaturalHeight * scale),
    totalWidth: fit.width,
    totalHeight: fit.height,
  };
}

/**
 * Hook-free ResizeObserver helper. Returns a cleanup function.
 * Call from useEffect with a ref and a callback receiving
 * { width, height } of the observed element's content box.
 */
export function observeSize(
  el: Element,
  onChange: (size: { width: number; height: number }) => void
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      onChange({ width, height });
    }
  });
  observer.observe(el);
  return () => observer.disconnect();
}