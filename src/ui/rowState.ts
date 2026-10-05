export function getCurrentId(currentId: string | null): string | null {
  return currentId;
}

export function isRowCurrent(rowId: string, currentId: string | null): boolean {
  return currentId !== null && rowId === currentId;
}

export type RowIcon = "play" | "pause";

export function rowIcon(rowId: string, currentId: string | null, audioPlaying: boolean): RowIcon {
  if (rowId === currentId && audioPlaying) return "pause";
  return "play";
}

export function rowAriaLabel(rowId: string, currentId: string | null, audioPlaying: boolean, title: string, index: number): string {
  const icon = rowIcon(rowId, currentId, audioPlaying);
  const action = icon === "pause" ? "Pause" : "Play";
  return `${action} ${title}, position ${index + 1}`;
}

export function shouldShowEqualizer(rowId: string, currentId: string | null): boolean {
  return isRowCurrent(rowId, currentId);
}

export function computeGap(zoneBottom: number, rowTop: number): number {
  return rowTop - zoneBottom;
}

export function isGapAcceptable(zoneBottom: number, rowTop: number): boolean {
  return computeGap(zoneBottom, rowTop) <= 16;
}
