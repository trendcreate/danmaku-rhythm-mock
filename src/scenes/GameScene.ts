import Phaser from 'phaser';
import kuuUrl from '../assets/kuu.mp3';

const W = 480;
const H = 640;

// ============================================================
// テンポ設定
// ============================================================
const BPM     = 130;
const BEAT_MS = 60_000 / BPM;  // ≈ 461.54 ms / beat

// ============================================================
// 東方参考値 + 画面スケール補正
//   東方 playfield : 384×448 px (TH6〜)
//   本ゲーム field : 480×640 px → 面積比 ≈ 1.79
//   体感スケール係数 : sqrt(面積比) ≈ 1.34
//
//   プレイヤー : px/sec = 東方 px/frame × 60 / FIELD_SCALE
//   弾        : さらに × 1.2 で追加減速 (もうちょっとゆっくり)
// ============================================================
const FIELD_SCALE     = Math.sqrt((W * H) / (384 * 448)); // ≈ 1.34
const BULLET_SCALE    = FIELD_SCALE * 1.2;                // ≈ 1.61

const PLAYER_SPEED    = Math.round(4 * 60 / FIELD_SCALE); // ≈ 179 px/sec
const PLAYER_SLOW_MULT = 0.5;
const PLAYER_HITBOX_R  = 2;    // 死亡判定半径 (px)
const PLAYER_INVINCIBLE = 2000; // ms

// 32 beat (= 8 小節) でパターンローテーション
const PHASE_BEATS       = 32;
const PHASE_DURATION_MS = PHASE_BEATS * BEAT_MS; // ≈ 14770 ms

// 弾速 (px/sec) — 東方 px/frame × 60 を BULLET_SCALE で補正
const SPD_SLOW = Math.round(2 * 60 / BULLET_SCALE); // ≈  75 px/sec
const SPD_MED  = Math.round(4 * 60 / BULLET_SCALE); // ≈ 149 px/sec
const SPD_FAST = Math.round(7 * 60 / BULLET_SCALE); // ≈ 261 px/sec

// --- 型 ---
interface Star { x: number; y: number; speed: number; size: number; }

interface Keys {
  left:  Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up:    Phaser.Input.Keyboard.Key;
  down:  Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
}

interface PatternDef {
  label:      string;
  intervalMs: number;
  fire:       (scene: GameScene) => void;
}

// ============================================================
// GameScene
// ============================================================
export class GameScene extends Phaser.Scene {
  private stars:         Star[]                       = [];
  private starGfx!:      Phaser.GameObjects.Graphics;
  private player!:       Phaser.Physics.Arcade.Sprite;
  private hitboxGfx!:    Phaser.GameObjects.Graphics;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private boss!:         Phaser.Physics.Arcade.Sprite;
  private keys!:         Keys;
  private scoreTxt!:     Phaser.GameObjects.Text;
  private livesTxt!:     Phaser.GameObjects.Text;
  private patternTxt!:   Phaser.GameObjects.Text;
  private startOverlay!: Phaser.GameObjects.Container;
  private bgm!:          Phaser.Sound.BaseSound;

  private lives        = 3;
  private score        = 0;
  private gameOver     = false;
  private started      = false;
  private patternIndex = 0;
  private shotTimer    = 0;
  private phaseTimer   = 0;
  private shotAngle    = 0;
  private invincible      = false;
  private invincibleTimer = 0;

  // パターン定義テーブル — 発射間隔は BEAT_MS の倍数
  private readonly patterns: PatternDef[] = [
    {
      // ────────────────────────────────────────────────────
      // Pattern 0 : 回転水玉  (1 beat ごと)
      //   count=8, Δ=17°/shot
      //   angular step = 360/8 = 45°
      //   gcd(45, 17) = 1  → 互いに素 → 同じ位置に戻るまで 45 shot
      //   見かけ上の 1 周 ≈ 360/17 ≈ 21 shot ≈ 9.7 秒
      // ────────────────────────────────────────────────────
      label:      'ROTATING RING',
      intervalMs: 0.25 * BEAT_MS,
      fire: (s) => {
        fireSpin(s, 16, s.shotAngle, SPD_MED, 0x4488ff);
        s.shotAngle += 7;
      },
    },
    {
      // ────────────────────────────────────────────────────
      // Pattern 1 : 桜花弁  (2 beat ごと)
      //   外 12-way 低速 + 内 12-way 中速 + 3-way 高速狙い
      // ────────────────────────────────────────────────────
      label:      'SAKURA',
      intervalMs: 2 * BEAT_MS,
      fire: (s) => {
        fireSpin(s, 12, s.shotAngle,      SPD_SLOW, 0xff88cc);
        fireSpin(s, 12, s.shotAngle + 15, SPD_MED,  0xff44aa);
        fireAimedSpread(s, 3, 10, SPD_FAST, 0xff2266);
        s.shotAngle += 7.5;
      },
    },
    {
      // ────────────────────────────────────────────────────
      // Pattern 2 : 迷宮  (1 beat ごと)
      //   16-way 中速 + 16-way 高速 (11.25° ずれ) + 3-way 狙い
      //   弾数を減らし、2 リング間の角度を広げて隙間を確保
      // ────────────────────────────────────────────────────
      label:      'MAZE',
      intervalMs: 1 * BEAT_MS,
      fire: (s) => {
        fireSpin(s, 16, s.shotAngle,        SPD_MED,  0xffaa22);
        fireSpin(s, 16, s.shotAngle + 11.25, SPD_FAST, 0xff6600);
        fireAimedSpread(s, 3, 20, SPD_MED,  0xffff44);
        s.shotAngle += 7.5;
      },
    },
  ];

  constructor() {
    super({ key: 'GameScene' });
  }

  // ----------------------------------------------------------
  // preload — BGM 読み込み
  // ----------------------------------------------------------
  preload(): void {
    this.load.audio('bgm', kuuUrl);
  }

  // ----------------------------------------------------------
  // create
  // ----------------------------------------------------------
  create(): void {
    this.lives        = 3;
    this.score        = 0;
    this.gameOver     = false;
    this.started      = false;
    this.patternIndex = 0;
    this.shotTimer    = 0;
    this.phaseTimer   = 0;
    this.shotAngle    = 0;
    this.invincible   = false;

    this._initTextures();
    this._createStarfield();
    this._createPlayer();
    this._createGroups();
    this._createBoss();
    this._createHUD();
    this._createKeys();
    this._createStartOverlay();
  }

  // ----------------------------------------------------------
  // update
  // ----------------------------------------------------------
  update(_time: number, delta: number): void {
    // スタート待機中も星だけ流す
    this._updateStarfield();
    if (!this.started || this.gameOver) return;

    this._handlePlayerMove();
    this._updateBoss(delta);
    this._handleCollisions();
    this._updateInvincible(delta);
    this._updateHitboxGfx();
    this._updateHUD();
    this._cullBullets();
  }

  // ----------------------------------------------------------
  // テクスチャ事前生成
  // ----------------------------------------------------------
  private _initTextures(): void {
    if (!this.textures.exists('bullet_s')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff); g.fillCircle(4, 4, 4);
      g.fillStyle(0x000000, 0.4); g.fillCircle(4, 4, 2);
      g.generateTexture('bullet_s', 8, 8);
      g.destroy();
    }
    if (!this.textures.exists('bullet_m')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff); g.fillCircle(6, 6, 6);
      g.fillStyle(0x000000, 0.4); g.fillCircle(6, 6, 3);
      g.generateTexture('bullet_m', 12, 12);
      g.destroy();
    }
  }

  // ----------------------------------------------------------
  // 星フィールド
  // ----------------------------------------------------------
  private _createStarfield(): void {
    this.starGfx = this.add.graphics();
    this.stars = Array.from({ length: 100 }, () => ({
      x:     Phaser.Math.Between(0, W),
      y:     Phaser.Math.Between(0, H),
      speed: Phaser.Math.FloatBetween(0.5, 2.5),
      size:  Phaser.Math.FloatBetween(0.5, 1.5),
    }));
  }

  private _updateStarfield(): void {
    this.starGfx.clear();
    for (const s of this.stars) {
      s.y += s.speed;
      if (s.y > H) { s.y = 0; s.x = Phaser.Math.Between(0, W); }
      const alpha = Phaser.Math.Clamp(s.speed / 2.5, 0.3, 1);
      this.starGfx.fillStyle(0xffffff, alpha);
      this.starGfx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  // ----------------------------------------------------------
  // プレイヤー
  // ----------------------------------------------------------
  private _createPlayer(): void {
    const gfx = this.add.graphics();
    drawShip(gfx);
    gfx.generateTexture('player', 32, 40);
    gfx.destroy();

    this.player = this.physics.add.sprite(W / 2, H - 80, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    // 東方準拠の小さな当たり判定 (半径 2px = 4×4)
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const d = PLAYER_HITBOX_R * 2;
    body.setSize(d, d);
    body.setOffset(16 - PLAYER_HITBOX_R, 20 - PLAYER_HITBOX_R);

    this.hitboxGfx = this.add.graphics().setDepth(11);
  }

  private _handlePlayerMove(): void {
    const k = this.keys;
    let vx = 0, vy = 0;

    if (k.left.isDown)       vx = -PLAYER_SPEED;
    else if (k.right.isDown) vx =  PLAYER_SPEED;
    if (k.up.isDown)         vy = -PLAYER_SPEED;
    else if (k.down.isDown)  vy =  PLAYER_SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    if (k.shift.isDown) { vx *= PLAYER_SLOW_MULT; vy *= PLAYER_SLOW_MULT; }

    this.player.setVelocity(vx, vy);
  }

  // Shift 押下中に当たり判定の赤丸を表示 (東方準拠)
  private _updateHitboxGfx(): void {
    this.hitboxGfx.clear();
    if (this.keys.shift.isDown) {
      this.hitboxGfx.fillStyle(0xff0000, 0.9);
      this.hitboxGfx.fillCircle(this.player.x, this.player.y, PLAYER_HITBOX_R);
    }
  }

  // ----------------------------------------------------------
  // グループ
  // ----------------------------------------------------------
  private _createGroups(): void {
    this.enemyBullets = this.physics.add.group({ maxSize: 1024 });
  }

  // ----------------------------------------------------------
  // ボス (中央固定)
  // ----------------------------------------------------------
  private _createBoss(): void {
    const gfx = this.add.graphics();
    drawBoss(gfx);
    gfx.generateTexture('boss', 64, 64);
    gfx.destroy();

    this.boss = this.physics.add.sprite(W / 2, 110, 'boss');
    this.boss.setDepth(10);
    this.boss.setImmovable(true);
  }

  // ----------------------------------------------------------
  // ボスパターン管理 (BPM 同期)
  // ----------------------------------------------------------
  private _updateBoss(delta: number): void {
    this.shotTimer  += delta;
    this.phaseTimer += delta;

    const pat = this.patterns[this.patternIndex]!;
    if (this.shotTimer >= pat.intervalMs) {
      this.shotTimer -= pat.intervalMs; // 余剰をキャリーして正確に刻む
      pat.fire(this);
    }

    if (this.phaseTimer >= PHASE_DURATION_MS) {
      this.phaseTimer   -= PHASE_DURATION_MS;
      this.shotAngle     = 0;
      this.patternIndex  = (this.patternIndex + 1) % this.patterns.length;
    }
  }

  // 外部ユーティリティ用ゲッター
  get bossX():       number                      { return this.boss.x; }
  get bossY():       number                      { return this.boss.y + 32; }
  get playerX():     number                      { return this.player.x; }
  get playerY():     number                      { return this.player.y; }
  get bulletGroup(): Phaser.Physics.Arcade.Group { return this.enemyBullets; }

  // ----------------------------------------------------------
  // 衝突判定
  // ----------------------------------------------------------
  private _handleCollisions(): void {
    if (this.invincible) return;

    this.physics.overlap(
      this.player,
      this.enemyBullets,
      (_player, bullet) => {
        (bullet as Phaser.Physics.Arcade.Sprite).setActive(false).setVisible(false);
        this._damagePlayer();
      },
    );
  }

  private _damagePlayer(): void {
    this.lives          -= 1;
    this.invincible      = true;
    this.invincibleTimer = PLAYER_INVINCIBLE;

    this.tweens.add({
      targets: this.player, alpha: 0,
      duration: 80, yoyo: true, repeat: 12,
    });

    if (this.lives <= 0) this._endGame();
  }

  private _endGame(): void {
    this.gameOver = true;
    this.bgm.stop();
    this.add.text(W / 2, H / 2, 'GAME OVER', {
      fontSize: '40px', color: '#ff4444',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20);

    this.input.keyboard!.once('keydown-R', () => this.scene.restart());
  }

  // ----------------------------------------------------------
  // 無敵時間
  // ----------------------------------------------------------
  private _updateInvincible(delta: number): void {
    if (!this.invincible) return;
    this.invincibleTimer -= delta;
    if (this.invincibleTimer <= 0) {
      this.invincible = false;
      this.player.setAlpha(1);
    }
  }

  // ----------------------------------------------------------
  // 画面外弾を削除
  // ----------------------------------------------------------
  private _cullBullets(): void {
    this.enemyBullets.getChildren().forEach((b) => {
      const s = b as Phaser.Physics.Arcade.Sprite;
      if (!s.active) return;
      if (s.x < -32 || s.x > W + 32 || s.y < -32 || s.y > H + 32) {
        s.setActive(false).setVisible(false);
      }
    });
  }

  // ----------------------------------------------------------
  // HUD
  // ----------------------------------------------------------
  private _createHUD(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    };
    this.scoreTxt   = this.add.text(8, 8,  'SCORE: 0',   style).setDepth(30);
    this.livesTxt   = this.add.text(8, 28, 'LIVES: ♥♥♥', style).setDepth(30);
    this.patternTxt = this.add.text(W / 2, H - 20,
      this.patterns[0]!.label,
      { fontSize: '12px', color: '#aaaaff', stroke: '#000', strokeThickness: 2 },
    ).setOrigin(0.5, 1).setDepth(30);
  }

  private _updateHUD(): void {
    this.scoreTxt.setText(`SCORE: ${this.score}`);
    this.livesTxt.setText(
      `LIVES: ${'♥'.repeat(this.lives)}${'♡'.repeat(Math.max(0, 3 - this.lives))}`,
    );
    this.patternTxt.setText(this.patterns[this.patternIndex]!.label);
  }

  // ----------------------------------------------------------
  // キー設定
  // ----------------------------------------------------------
  private _createKeys(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };

    this.add.text(W - 8, 8,
      '← → ↑ ↓: 移動\nShift: 低速 / 当たり判定表示\nR: リスタート',
      { fontSize: '11px', color: '#888888', align: 'right' },
    ).setOrigin(1, 0).setDepth(30);
  }

  // ----------------------------------------------------------
  // スタートオーバーレイ
  // ----------------------------------------------------------
  private _createStartOverlay(): void {
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75);

    const title = this.add.text(W / 2, H / 2 - 60, '弾幕ゲーム', {
      fontSize: '36px', color: '#ffffff',
      stroke: '#000088', strokeThickness: 6,
    }).setOrigin(0.5);

    const bpmTxt = this.add.text(W / 2, H / 2 - 10, `♩ = ${BPM} BPM`, {
      fontSize: '18px', color: '#aaaaff',
    }).setOrigin(0.5);

    const prompt = this.add.text(W / 2, H / 2 + 40, 'クリック / タップ でスタート', {
      fontSize: '18px', color: '#ffff88',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // 点滅アニメーション
    this.tweens.add({
      targets: prompt, alpha: 0,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.startOverlay = this.add.container(0, 0, [bg, title, bpmTxt, prompt]).setDepth(50);

    // クリック / キーで開始
    this.input.once('pointerdown', () => this._startGame());
    this.input.keyboard!.once('keydown', () => this._startGame());
  }

  private _startGame(): void {
    if (this.started) return;
    this.started = true;
    this.startOverlay.destroy();

    this.bgm = this.sound.add('bgm', { loop: true });
    this.bgm.play();
  }
}

// ============================================================
// 弾幕ユーティリティ
// ============================================================

function fireSpin(
  scene: GameScene,
  count: number,
  baseAngle: number,
  speed: number,
  color: number,
  texKey = 'bullet_s',
): void {
  const step = 360 / count;
  for (let i = 0; i < count; i++) {
    const rad = Phaser.Math.DegToRad(baseAngle + step * i);
    spawnBullet(scene, scene.bossX, scene.bossY,
      Math.cos(rad) * speed, Math.sin(rad) * speed, color, texKey);
  }
}

function fireAimedSpread(
  scene: GameScene,
  count: number,
  spread: number,
  speed: number,
  color: number,
): void {
  const aimAngle = Phaser.Math.RadToDeg(
    Phaser.Math.Angle.Between(scene.bossX, scene.bossY, scene.playerX, scene.playerY),
  );
  const half = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const rad = Phaser.Math.DegToRad(aimAngle + (i - half) * spread);
    spawnBullet(scene, scene.bossX, scene.bossY,
      Math.cos(rad) * speed, Math.sin(rad) * speed, color, 'bullet_m');
  }
}

function spawnBullet(
  scene: GameScene,
  x: number, y: number,
  vx: number, vy: number,
  color: number,
  texKey: string,
): void {
  const b = scene.bulletGroup.get(x, y, texKey) as Phaser.Physics.Arcade.Sprite | null;
  if (!b) return;

  b.setTexture(texKey);
  b.setActive(true).setVisible(true);
  b.setTint(color);
  b.setDepth(8);

  const body = b.body as Phaser.Physics.Arcade.Body;
  body.setVelocity(vx, vy);
  body.setAllowGravity(false);
}

// ============================================================
// 描画ヘルパー
// ============================================================

function drawShip(gfx: Phaser.GameObjects.Graphics): void {
  gfx.fillStyle(0x44aaff);
  gfx.fillTriangle(16, 0, 0, 36, 32, 36);
  gfx.fillStyle(0x2266cc);
  gfx.fillRect(10, 30, 12, 8);
  gfx.fillStyle(0xcceeff);
  gfx.fillEllipse(16, 16, 8, 12);
}

function drawBoss(gfx: Phaser.GameObjects.Graphics): void {
  gfx.fillStyle(0xcc3333);
  gfx.fillRect(8, 8, 48, 48);
  gfx.fillStyle(0xff8800); gfx.fillCircle(32, 32, 14);
  gfx.fillStyle(0xffdd00); gfx.fillCircle(32, 32, 8);
  gfx.fillStyle(0xffffff); gfx.fillCircle(32, 32, 3);
  gfx.fillStyle(0x882222);
  gfx.fillTriangle(0, 16, 8, 16, 0, 48);
  gfx.fillTriangle(64, 16, 56, 16, 64, 48);
}
