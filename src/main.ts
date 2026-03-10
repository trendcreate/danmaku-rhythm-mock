import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene.js';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 640,
  backgroundColor: '#0a0a1a',
  scene: [GameScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
};

new Phaser.Game(config);
