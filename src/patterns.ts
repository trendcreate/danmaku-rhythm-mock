import { BEAT_MS, FIELD_SCALE } from './constants.js';
import { fireSpin, fireAimedSpread } from './bullets.js';
import type { FireContext } from './bullets.js';
import type { JudgeLineDef } from './judgeLines.js';

export interface PatternDef {
  label:       string;
  intervalMs:  number;
  fire:        (ctx: FireContext) => void;
  judgeLines?: JudgeLineDef[];
}

// 弾速プリセット — 東方 px/frame × 60 を BULLET_SCALE で補正
const BULLET_SCALE = FIELD_SCALE * 2;
const SPD_SLOW = Math.round(2 * 60 / BULLET_SCALE);   // ≈  75 px/sec
const SPD_MED  = Math.round(4 * 60 / BULLET_SCALE);   // ≈ 149 px/sec
const SPD_FAST = Math.round(7 * 60 / BULLET_SCALE);   // ≈ 261 px/sec

// 中心座標は常に画面中央に固定されるため、角度のみ補間する
function gradientLines(
  beats:  number[],
  angles: [number, number],
): JudgeLineDef[] {
  const n = beats.length;
  return beats.map((beatOffset, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    return {
      beatOffset,
      angle: angles[0] + (angles[1] - angles[0]) * t,
    };
  });
}

export const PATTERNS: PatternDef[] = [
  {
    label:      'ROTATING RING',
    intervalMs: 0.5 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 16, ctx.shotAngle, SPD_MED, 0x4488ff);
      ctx.shotAngle += 7;
    },
    judgeLines: gradientLines(
      [10, 14, 18, 22, 26, 30],
      [-25, 25],
    ),
  },
  {
    label:      'SAKURA',
    intervalMs: 2 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 12, ctx.shotAngle,      SPD_SLOW, 0xff88cc);
      fireSpin(ctx, 12, ctx.shotAngle + 15, SPD_MED,  0xff44aa);
      fireAimedSpread(ctx, 3, 10, SPD_FAST, 0xff2266);
      ctx.shotAngle += 7.5;
    },
    judgeLines: gradientLines(
      [7, 15, 23, 31],
      [10, -10],
    ),
  },
  {
    label:      'MAZE',
    intervalMs: 2 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 12, ctx.shotAngle,         SPD_MED,  0xffaa22);
      fireSpin(ctx, 12, ctx.shotAngle + 11.25, SPD_FAST, 0xff6600);
      fireAimedSpread(ctx, 3, 20, SPD_MED, 0xffff44);
      ctx.shotAngle += 7.5;
    },
    judgeLines: gradientLines(
      [9, 10, 13, 14, 17, 18, 24, 28, 30],
      [-35, 35],
    ),
  },
];
