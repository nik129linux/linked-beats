import { test } from "node:test";
import assert from "node:assert/strict";
import { isRowCurrent, rowIcon, rowAriaLabel, shouldShowEqualizer, computeGap, isGapAcceptable } from "../dist/ui/rowState.js";
import { mirroredIndex as vizMirrored, computeLogBins as vizBins } from "../dist/ui/visualizer.js";

test("isRowCurrent - only current id is true", () => {
  assert.equal(isRowCurrent("a", "a"), true);
  assert.equal(isRowCurrent("a", "b"), false);
  assert.equal(isRowCurrent("a", null), false);
});

test("rowIcon - pause only when current AND playing", () => {
  assert.equal(rowIcon("a", "a", true), "pause");
  assert.equal(rowIcon("a", "a", false), "play");
  assert.equal(rowIcon("b", "a", true), "play");
  assert.equal(rowIcon("b", null, true), "play");
});

test("exactly one row in playing state", () => {
  const ids = ["a","b","c","d"];
  const current = "b";
  const playingRows = ids.filter(id => isRowCurrent(id, current));
  assert.equal(playingRows.length, 1);
  assert.equal(playingRows[0], "b");
});

test("rowAriaLabel reflects play/pause", () => {
  assert.equal(rowAriaLabel("a","a",true,"Song A",0), "Pause Song A, position 1");
  assert.equal(rowAriaLabel("b","a",true,"Song B",1), "Play Song B, position 2");
});

test("shouldShowEqualizer only on current", () => {
  assert.equal(shouldShowEqualizer("a","a"), true);
  assert.equal(shouldShowEqualizer("b","a"), false);
});

test("computeGap and isGapAcceptable", () => {
  assert.equal(computeGap(345, 353), 8);
  assert.equal(isGapAcceptable(345, 353), true);
  assert.equal(isGapAcceptable(345, 465), false);
  assert.equal(computeGap(100, 116), 16);
  assert.equal(isGapAcceptable(100, 116), true);
  assert.equal(isGapAcceptable(100, 117), false);
});

test("visualizer mirroredIndex symmetric", () => {
  // 48 bars, halves mirror
  assert.equal(vizMirrored(0,48), 23);
  assert.equal(vizMirrored(23,48), 0);
  assert.equal(vizMirrored(24,48), 0);
  assert.equal(vizMirrored(47,48), 23);
  assert.equal(vizMirrored(12,48), 11);
});

test("visualizer log bins monotonic and within fft", () => {
  const bins = vizBins(48000, 2048, 24, 40, 12000);
  assert.equal(bins.length, 24);
  for (let i=1;i<bins.length;i++) assert.ok(bins[i] >= bins[i-1], "bins monotonic");
  assert.ok(bins[0] >= 0 && bins[0] < 1024);
  assert.ok(bins[bins.length-1] < 1024);
});

test("rowState vs visualizer helpers present", () => {
  assert.ok(typeof vizMirrored === "function");
  assert.ok(typeof vizBins === "function");
});
