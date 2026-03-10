import Phaser from 'phaser';

// ============================================================
// 弾幕ユーティリティが要求するシーンのコンテキスト
// (GameScene を直接参照しないため循環参照なし)
// ============================================================
export interface FireContext {
  readonly bossX:       number;
  readonly bossY:       number;
  readonly playerX:     number;
  readonly playerY:     number;
  readonly bulletGroup: Phaser.Physics.Arcade.Group;
  shotAngle:            number;  // fire 関数が読み書きする
}

// ============================================================
// 全方位ショット (等間隔で count 方向)
// ============================================================
export function fireSpin(
  ctx:      FireContext,
  count:    number,
  baseAngle: number,
  speed:    number,
  color:    number,
  texKey = 'bullet_s',
): void {
  const step = 360 / count;
  for (let i = 0; i < count; i++) {
    const rad = Phaser.Math.DegToRad(baseAngle + step * i);
    spawnBullet(ctx, ctx.bossX, ctx.bossY,
      Math.cos(rad) * speed, Math.sin(rad) * speed, color, texKey);
  }
}

// ============================================================
// プレイヤー狙い扇形ショット
// ============================================================
export function fireAimedSpread(
  ctx:    FireContext,
  count:  number,
  spread: number,
  speed:  number,
  color:  number,
): void {
  const aimAngle = Phaser.Math.RadToDeg(
    Phaser.Math.Angle.Between(ctx.bossX, ctx.bossY, ctx.playerX, ctx.playerY),
  );
  const half = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const rad = Phaser.Math.DegToRad(aimAngle + (i - half) * spread);
    spawnBullet(ctx, ctx.bossX, ctx.bossY,
      Math.cos(rad) * speed, Math.sin(rad) * speed, color, 'bullet_m');
  }
}

// ============================================================
// 弾 1 発をプールから取り出して配置
// ============================================================
export function spawnBullet(
  ctx:    FireContext,
  x:      number,
  y:      number,
  vx:     number,
  vy:     number,
  color:  number,
  texKey: string,
): void {
  const b = ctx.bulletGroup.get(x, y, texKey) as Phaser.Physics.Arcade.Sprite | null;
  if (!b) return;

  b.setTexture(texKey);
  b.setActive(true).setVisible(true);
  b.setTint(color);
  b.setDepth(8);

  const body = b.body as Phaser.Physics.Arcade.Body;
  body.setVelocity(vx, vy);
  body.setAllowGravity(false);
}
