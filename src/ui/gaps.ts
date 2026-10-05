/**
 * Gap reconcile logic for #songList.
 * Invariant (non-filtered): children alternate gap, row, gap, row, ..., gap
 * with exactly rows+1 gaps. Gap k has data-index = k.
 * Filtered: children are rows only, no gaps.
 * For 0 rows non-filtered: one gap (empty state's drop target).
 */

export function gapCount(rowCount: number, filtered: boolean): number {
  if (filtered) return 0;
  return rowCount + 1;
}

export function expectedPattern(rowCount: number, filtered: boolean): Array<"gap" | "row"> {
  if (filtered) {
    return Array.from({ length: rowCount }, () => "row" as const);
  }
  const res: Array<"gap" | "row"> = [];
  for (let i = 0; i < rowCount; i++) {
    res.push("gap");
    res.push("row");
  }
  res.push("gap");
  return res;
}

export function expectedGapIndices(rowCount: number, filtered: boolean): number[] {
  if (filtered) return [];
  return Array.from({ length: rowCount + 1 }, (_, i) => i);
}

export function isValidSequence(kinds: Array<"gap" | "row">, rowCount: number, filtered: boolean): boolean {
  const exp = expectedPattern(rowCount, filtered);
  if (kinds.length !== exp.length) return false;
  for (let i = 0; i < exp.length; i++) if (kinds[i] !== exp[i]) return false;
  return true;
}

export function isValidGapIndices(indices: number[], rowCount: number, filtered: boolean): boolean {
  const exp = expectedGapIndices(rowCount, filtered);
  if (indices.length !== exp.length) return false;
  for (let i = 0; i < exp.length; i++) if (indices[i] !== exp[i]) return false;
  return true;
}

/**
 * Pure model of reconcile: given current gap/row kinds before patch,
 * returns what the final kinds must be. This proves no leak regardless
 * of how many extra gaps existed.
 */
export function reconcilePure(
  _currentKinds: Array<"gap" | "row">,
  rowCount: number,
  filtered: boolean,
): Array<"gap" | "row"> {
  return expectedPattern(rowCount, filtered);
}

/**
 * DOM helper: ensure container has exactly needed gap nodes.
 * Reuses existing gap elements (first needed), removes extras,
 * creates missing, and sets data-index / data-id on each.
 * Returns the gap elements in index order 0..needed-1.
 */
export function ensureGapPool(container: HTMLElement, rowCount: number, filtered: boolean): HTMLElement[] {
  const needed = gapCount(rowCount, filtered);
  const existing = Array.from(container.querySelectorAll(".gap")) as HTMLElement[];

  if (filtered) {
    for (const g of existing) g.remove();
    return [];
  }

  // Remove extras beyond needed (leaked gaps)
  if (existing.length > needed) {
    for (let i = needed; i < existing.length; i++) existing[i]!.remove();
    existing.length = needed;
  }

  // Create missing gaps reusing pool
  while (existing.length < needed) {
    const g = document.createElement("div");
    g.className = "gap drop-zone between";
    existing.push(g);
    // Not yet attached; caller will place in order via append.
  }

  // Ensure each gap has correct data-index and id, and class
  for (let i = 0; i < existing.length; i++) {
    const g = existing[i]!;
    g.className = "gap drop-zone between";
    g.dataset["index"] = String(i);
    g.dataset["id"] = `gap-${i}`;
  }

  // If gaps not yet in container, they will be appended by reorder step.
  // For gaps already in container, keep them; for new ones, keep detached for now.
  return existing;
}

/**
 * Reorder gaps and rows inside container to enforce alternating pattern.
 * Gaps must be array in index order; rows must be array in display order.
 */
export function reorderGapsAndRows(container: HTMLElement, gaps: HTMLElement[], rows: HTMLElement[]): void {
  // Append in alternating order gap0,row0,gap1,row1,...,gapN
  // Using appendChild moves existing nodes, so no duplication.
  for (let i = 0; i < rows.length; i++) {
    container.appendChild(gaps[i]!);
    container.appendChild(rows[i]!);
  }
  if (gaps.length > rows.length) {
    container.appendChild(gaps[gaps.length - 1]!);
  }
  // If filtered (no gaps), rows only already handled; this is non-filtered path.
}
