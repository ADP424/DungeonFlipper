/**
 * Bodies drawn once per direction they face. There are eight directions (east first, clockwise on
 * screen), and each names the view that shows it and whether that view is mirrored. Diagonals are
 * always drawn facing right and mirrored for the left; a view set differs in how it treats the sides.
 */
export type BodyView = [view: string, mirror: boolean];

export const BODY_VIEWS = {
  /** Five views: `side` is drawn facing right, and mirrored for the left. */
  mirrored: [
    ['side', false], ['front_diag', false], ['front', false], ['front_diag', true],
    ['side', true], ['back_diag', true], ['back', false], ['back_diag', false],
  ],
  /** Six views: `right` and `left` are drawn separately, for a body whose two sides differ. */
  sided: [
    ['right', false], ['front_diag', false], ['front', false], ['front_diag', true],
    ['left', false], ['back_diag', true], ['back', false], ['back_diag', false],
  ],
} satisfies Record<string, BodyView[]>;
export type BodyViewSet = keyof typeof BODY_VIEWS;

/** Which of the eight directions an angle (radians) is nearest. */
export const dirOf = (angle: number): number => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
/** Steps between two of the eight directions (0–4). */
export const dirGap = (a: number, b: number): number => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

/** The view of a set that shows a body facing along `angle`. */
export const viewAt = (set: BodyViewSet, angle: number): BodyView => BODY_VIEWS[set][dirOf(angle)]!;
/** The names of the views a set needs drawn. */
export const viewNames = (set: BodyViewSet): string[] => [...new Set(BODY_VIEWS[set].map(([view]) => view))];
