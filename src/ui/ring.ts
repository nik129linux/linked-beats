// Pure ring geometry helpers — no DOM, no side effects.
export type RingGeometry = {
  dasharray: number;
  dashoffset: number;
  knobX: number;
  knobY: number;
};

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Geometry for a circular progress ring.
 * progress01 0..1 (0 = empty, 1 = full). radius in px, stroke in px (unused for calc but kept for API).
 * Returns dasharray/dashoffset for an SVG circle and knob position at arc end.
 * Center is assumed at (radius, radius) with the circle drawn there; knob coords are relative to center.
 */
export function ringGeometry(progress01: number, radius: number, _stroke: number): RingGeometry {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const p = clamp(progress01, 0, 1);
  const circumference = 2 * Math.PI * r;
  const dasharray = circumference;
  const dashoffset = circumference * (1 - p);
  // knob at arc end, 0 at 12 o'clock clockwise
  const angle = p * 2 * Math.PI - Math.PI / 2;
  // alternative using sin/cos for 0 at top: x = r * sin(2pi p), y = -r*cos(2pi p)
  // both equivalent; we use cos/sin with offset.
  const knobX = r + r * Math.cos(angle);
  const knobY = r + r * Math.sin(angle);
  // For r=0, knob at center (0,0 offset -> r)
  if (r === 0) return { dasharray: 0, dashoffset: 0, knobX: 0, knobY: 0 };
  return { dasharray, dashoffset, knobX, knobY };
}

/**
 * Convert pointer position to progress 0..1.
 * 0 is 12 o'clock, clockwise.
 * Handles center point (returns prev or 0) and wrap-around: if prev is near 0 or 1 and raw jumps across 12 o'clock,
 * clamp to 0 or 1 instead of wrapping 0->1.
 */
export function angleToProgress(
  px: number,
  py: number,
  cx: number,
  cy: number,
  prev?: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  // center point: indeterminate, return prev or 0
  if (dx === 0 && dy === 0) {
    if (typeof prev === "number" && Number.isFinite(prev)) return clamp(prev, 0, 1);
    return 0;
  }
  // atan2 gives angle from +x axis; we want 0 at -y (12 o'clock) clockwise.
  // Compute raw angle: atan2(dy, dx) yields -PI..PI with 0 at 3 o'clock.
  // Shift so 0 at 12 o'clock: add PI/2, then normalize to 0..2PI clockwise.
  let angle = Math.atan2(dy, dx) + Math.PI / 2;
  // normalize to [0, 2PI)
  while (angle < 0) angle += 2 * Math.PI;
  while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
  let raw = angle / (2 * Math.PI);
  raw = clamp(raw, 0, 1);
  // Guard tiny wrap-around near 12 o'clock: if dragging, don't jump 0 ->1.
  if (typeof prev === "number" && Number.isFinite(prev)) {
    const p = clamp(prev, 0, 1);
    // if prev near 0 (e.g., 0.02) and raw near 1 (e.g., 0.98), user dragged a little past top CCW => clamp to 0
    // if prev near 1 (0.98) and raw near 0 (0.02), clamp to 1
    if (p < 0.25 && raw > 0.75) return 0;
    if (p > 0.75 && raw < 0.25) return 1;
  }
  // edge: exactly 0/1 handling for -0
  if (Object.is(raw, -0)) raw = 0;
  return raw;
}

export function clampSeek(progress: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const p = clamp(progress, 0, 1);
  const t = p * duration;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(duration, t));
}
