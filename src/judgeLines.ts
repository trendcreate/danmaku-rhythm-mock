import Phaser from 'phaser';
import { BEAT_MS } from './constants.js';

export type JudgeRank = 'PERFECT' | 'GREAT' | 'FAST' | 'LATE';

export const APPEAR_MS  = 8 * BEAT_MS;  // 8 beat ≈ 3.7s
export const FADE_MS    = 450;
export const HIT_THRESH = 11;           // アウターグロー半径に合わせた垂直距離しきい値 (px)

export const DEFAULT_LINE_SPACING = 120; // px

export const JUDGE_WINDOWS = {
  PERFECT:  70,   // ±ms
  GREAT:   160,
  FAST:    280,   // 判定前の許容幅 (ms)
  LATE:    500,   // 判定後の許容幅 (ms)
} as const;

export const JUDGE_SCORE: Record<JudgeRank, number> = {
  PERFECT: 300,
  GREAT:   150,
  FAST:    50,
  LATE:    50,
};

const RANK_COLOR: Record<JudgeRank, number> = {
  PERFECT: 0xffd700,
  GREAT:   0x44ff88,
  FAST:    0x4488ff,
  LATE:    0xff6644,
};

// ============================================================
// 型定義
// ============================================================

/** PatternDef に埋め込む静的な判定ライン定義 */
export interface JudgeLineDef {
  beatOffset:   number;   // フェーズ内のビート位置 (0 .. PHASE_BEATS-1)
  angle:        number;   // 水平からの角度 (degrees)
  // 中心座標は常に画面中央 (W/2, H/2) に固定
  // 本数は lineSpacing と画面サイズから自動計算 (実質無限)
  lineSpacing?: number;   // ライン間隔 px (省略時 DEFAULT_LINE_SPACING)
}

/** GameScene が管理するランタイム状態 */
export interface ActiveJudgeLine {
  def:              JudgeLineDef;
  perfectPhaseMs:   number;          // phaseTimer の判定完璧値
  hit:              boolean;
  resolved:         boolean;
  hitRank?:         JudgeRank;
  resolvedElapsed?: number;          // 解決時の GameScene.elapsedMs
  prevSignedDist?:  number;          // 前フレームの符号付き垂直距離 (通過検知用)
}

// ============================================================
// 判定ロジック
// ============================================================

/**
 * delta = currentPhaseMs - perfectPhaseMs
 *   負 = 早すぎ (FAST) / 正 = 遅すぎ (LATE)
 */
export function getRank(delta: number): JudgeRank | null {
  if (delta < -JUDGE_WINDOWS.FAST || delta > JUDGE_WINDOWS.LATE) return null;
  if (Math.abs(delta) <= JUDGE_WINDOWS.PERFECT) return 'PERFECT';
  if (Math.abs(delta) <= JUDGE_WINDOWS.GREAT)   return 'GREAT';
  return delta < 0 ? 'FAST' : 'LATE';
}

/**
 * 画面中央 (cx, cy) を通過し間隔 spacing で並ぶ平行ライン群への最小垂直距離
 * 本数は W / H から自動計算 (画面全体をカバーできる数)
 */
export function minDistToLines(
  px: number, py: number,
  cx: number, cy: number,
  angleRad: number,
  spacing: number,
  W: number, H: number,
): number {
  const signed    = -Math.sin(angleRad) * (px - cx) + Math.cos(angleRad) * (py - cy);
  const halfCount = Math.ceil(Math.hypot(W / 2, H / 2) / spacing) + 1;
  let minDist     = Infinity;
  for (let i = -halfCount; i <= halfCount; i++) {
    minDist = Math.min(minDist, Math.abs(signed - i * spacing));
  }
  return minDist;
}

// ============================================================
// 描画
// ============================================================

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16)
       | (Math.round(g1 + (g2 - g1) * t) << 8)
       |  Math.round(b1 + (b2 - b1) * t);
}

function strokeLine(
  gfx: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
): void {
  gfx.beginPath();
  gfx.moveTo(x1, y1);
  gfx.lineTo(x2, y2);
  gfx.strokePath();
}

/**
 * 判定ラインを Graphics に描画する
 * 中心は常に画面中央 (W/2, H/2)、本数は spacing と画面サイズから自動決定
 *
 * @param progress  0=出現直後 / 1=判定タイミング / >1=解決後フェードアウト中
 * @param rank      undefined=未解決 / JudgeRank=ヒット / null=ミス
 */
export function drawJudgeLine(
  gfx:      Phaser.GameObjects.Graphics,
  def:      JudgeLineDef,
  progress: number,
  W:        number,
  H:        number,
  rank:     JudgeRank | null | undefined,
): void {
  const spacing   = def.lineSpacing ?? DEFAULT_LINE_SPACING;
  const cx        = W / 2;
  const cy        = H / 2;
  const rad       = Phaser.Math.DegToRad(def.angle);
  const len       = Math.hypot(W, H) + 64;
  const dx        = Math.cos(rad) * len;
  const dy        = Math.sin(rad) * len;
  const nx        = -Math.sin(rad);
  const ny        =  Math.cos(rad);
  const halfCount = Math.ceil(Math.hypot(W / 2, H / 2) / spacing) + 1;

  let color: number;
  let alpha: number;

  if (rank !== undefined) {
    color = rank !== null ? RANK_COLOR[rank] : 0x445566;
    alpha = Phaser.Math.Clamp(1 - (progress - 1) / 0.6, 0, 1);
  } else {
    const t = Phaser.Math.Clamp(progress, 0, 1);
    color = t < 0.8
      ? lerpColor(0x1133ee, 0x00ddff, t / 0.8)
      : lerpColor(0x00ddff, 0xffffff, (t - 0.8) / 0.2);
    const pulse = t > 0.75
      ? Math.sin((t - 0.75) / 0.25 * Math.PI * 8) * 0.18
      : 0;
    alpha = Phaser.Math.Clamp(0.08 + t * 0.92 + pulse, 0, 1);
  }

  if (alpha <= 0.01) return;

  for (let i = -halfCount; i <= halfCount; i++) {
    const offset = i * spacing;
    const lcx    = cx + offset * nx;
    const lcy    = cy + offset * ny;

    gfx.lineStyle(22, color, alpha * 0.08); strokeLine(gfx, lcx - dx, lcy - dy, lcx + dx, lcy + dy);
    gfx.lineStyle(7,  color, alpha * 0.38); strokeLine(gfx, lcx - dx, lcy - dy, lcx + dx, lcy + dy);
    gfx.lineStyle(2,  color, alpha);        strokeLine(gfx, lcx - dx, lcy - dy, lcx + dx, lcy + dy);
  }
}
