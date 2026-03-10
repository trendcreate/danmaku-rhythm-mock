import { BEAT_MS, FIELD_SCALE } from './constants.js';
import { fireSpin, fireAimedSpread } from './bullets.js';
import type { FireContext } from './bullets.js';

// ============================================================
// 弾幕パターンの型定義
// ============================================================
export interface PatternDef {
  label:      string;
  intervalMs: number;
  fire:       (ctx: FireContext) => void;
}

// 弾速プリセット — 東方 px/frame × 60 を BULLET_SCALE で補正
const BULLET_SCALE = FIELD_SCALE * 1.2;                // ≈ 1.61
const SPD_SLOW = Math.round(2 * 60 / BULLET_SCALE);   // ≈  75 px/sec
const SPD_MED  = Math.round(4 * 60 / BULLET_SCALE);   // ≈ 149 px/sec
const SPD_FAST = Math.round(7 * 60 / BULLET_SCALE);   // ≈ 261 px/sec

// ============================================================
// 弾幕パターン定義テーブル
// 新パターンを追加するにはこの配列に要素を追加するだけでよい
// ============================================================
export const PATTERNS: PatternDef[] = [
  {
    // ──────────────────────────────────────────────────────
    // Pattern 0 : 回転水玉  (0.25 beat ごと)
    //   count=16, Δ=7°/shot
    //   見かけ上の 1 周 ≈ 360/7 ≈ 51 shot ≈ 5.9 秒
    // ──────────────────────────────────────────────────────
    label:      'ROTATING RING',
    intervalMs: 0.25 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 16, ctx.shotAngle, SPD_MED, 0x4488ff);
      ctx.shotAngle += 7;
    },
  },
  {
    // ──────────────────────────────────────────────────────
    // Pattern 1 : 桜花弁  (2 beat ごと)
    //   外 12-way 低速 + 内 12-way 中速 + 3-way 高速狙い
    // ──────────────────────────────────────────────────────
    label:      'SAKURA',
    intervalMs: 2 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 12, ctx.shotAngle,      SPD_SLOW, 0xff88cc);
      fireSpin(ctx, 12, ctx.shotAngle + 15, SPD_MED,  0xff44aa);
      fireAimedSpread(ctx, 3, 10, SPD_FAST, 0xff2266);
      ctx.shotAngle += 7.5;
    },
  },
  {
    // ──────────────────────────────────────────────────────
    // Pattern 2 : 迷宮  (1 beat ごと)
    //   16-way 中速 + 16-way 高速 (11.25° ずれ) + 3-way 狙い
    // ──────────────────────────────────────────────────────
    label:      'MAZE',
    intervalMs: 1 * BEAT_MS,
    fire(ctx) {
      fireSpin(ctx, 16, ctx.shotAngle,         SPD_MED,  0xffaa22);
      fireSpin(ctx, 16, ctx.shotAngle + 11.25, SPD_FAST, 0xff6600);
      fireAimedSpread(ctx, 3, 20, SPD_MED, 0xffff44);
      ctx.shotAngle += 7.5;
    },
  },
];
