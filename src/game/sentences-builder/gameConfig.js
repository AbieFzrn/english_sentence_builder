import Phaser from 'phaser';
import MainScene from './scenes/mainScene';

// Ruang desain: tinggi tetap 600, lebar mengikuti bentuk jendela (dibatasi supaya
// tata letak tidak terlalu sempit atau terlalu lebar). Kanvas dirender RENDER_SCALE kali
// lebih besar supaya tajam; mainScene.js mengatur zoom kamera agar pas.
const DESIGN_H = 600;
const RENDER_SCALE = 2;
const MIN_ASPECT = 1.2;
const MAX_ASPECT = 2.4;

let gameInstance = null;
let resizeObserver = null;
let resizeTimer = null;

function computeGameSize(el) {
    const { width, height } = el.getBoundingClientRect();
    const aspect = width > 0 && height > 0 ? width / height : 4 / 3;
    const clamped = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
    return {
        width: Math.round(DESIGN_H * clamped) * RENDER_SCALE,
        height: DESIGN_H * RENDER_SCALE,
    };
}

export function stopGame() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    clearTimeout(resizeTimer);

    if (gameInstance) {
        gameInstance.destroy(true);
        gameInstance = null;
    }
}

export function startGame(settings) {
    // Hancurkan game lama jika ada untuk memuat data baru
    stopGame();

    const parent = document.getElementById('app');

    const config = {
        type: Phaser.AUTO,
        ...computeGameSize(parent),
        parent,
        backgroundColor: '#fdf2f8',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 0 } },
        },
    };

    gameInstance = new Phaser.Game(config);
    gameInstance.scene.add('MainScene', MainScene, true, settings);

    // Ubah bentuk kanvas kalau area game berubah ukuran (jendela di-resize, rotasi layar, dll.)
    resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!gameInstance) return;
            const next = computeGameSize(parent);
            const current = gameInstance.scale.gameSize;
            if (next.width !== current.width || next.height !== current.height) {
                gameInstance.scale.resize(next.width, next.height);
            }
        }, 80);
    });
    resizeObserver.observe(parent);
}