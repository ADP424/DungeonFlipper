/**
 * The UI is drawn on the same pixel grid as the game. `--p` is one art pixel in CSS px: the world's
 * pixel scale (Game.resize), a whole number of device pixels. Every UI dimension except text is a
 * whole number of `--p`, and pixel-art icons are exactly their art size in `--p`.
 */
export function setPixelUnit(cssPx: number): void {
  document.documentElement.style.setProperty('--p', `${cssPx}px`);
}

/** Size an <img> of `w`×`h` art pixels. */
export function pixelSize(img: HTMLElement, w: number, h: number): void {
  img.style.width = `calc(${w} * var(--p))`;
  img.style.height = `calc(${h} * var(--p))`;
}

/** The fill of a bar `width` art pixels wide, in whole art pixels. */
export function barWidth(frac: number, width: number): string {
  return `calc(${Math.round(Math.max(0, Math.min(1, frac)) * width)} * var(--p))`;
}

/** Inner width of a `.tip-bar` (tooltips, panels), in art pixels. */
export const TIP_BAR_W = 40;
