import Phaser from 'phaser';
import { generateDistractors } from '../distractors.js';

// ==========================================
// KONSTANTA TATA LETAK
// Tinggi ruang desain tetap 600. Lebarnya (this.W) menyesuaikan bentuk jendela,
// lihat computeGameSize di gameConfig.js.
// ==========================================
const H = 600;
const FLOAT = { top: 80, bottom: 320 };                  // area kata melayang
const ZONE_Y = 335;                                      // area menyusun kalimat
const ZONE_H = 170;
const ROW_Y = [350, 402, 454];                           // tinggi tiap baris di area susun
const ROW_STEP = 52;
const START_X = 36;
const SIDE_PAD = 36;                                     // jarak kartu terakhir ke tepi kanan
const GAP = 12;

const FONT = 'Arial, sans-serif';
const TEXT_RES = 2;   // teks digambar 2x lebih rapat supaya tajam saat kamera di-zoom
const COLORS = {
    free: '#ec4899',     // kartu melayang
    placed: '#16a34a',   // kartu di area susun
    text: '#831843',
    hint: '#be185d',
    good: '#15803d',
    bad: '#b91c1c',
};

export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    // Menerima objek pengaturan dari form guru (lihat collectSettings di main.js)
    init(data) {
        this.settings = data;
        this.round = 0;
        this.score = 0;
        this.roundActive = false;
        this.seenSentences = new Set();
        this.placed = [];    // kartu di area susun, urut dari kiri ke kanan
        this.history = [];   // urutan kartu diletakkan, untuk UNDO
        this.target = [];
        this.endObjs = [];   // objek layar akhir, supaya ikut bergeser saat jendela berubah
    }

    preload() {
        const { music, success, fail } = this.settings.audio;
        if (music) this.load.audio('bgm', music);
        if (success) this.load.audio('sfx-success', success);
        if (fail) this.load.audio('sfx-fail', fail);
    }

    create() {
        this.cameras.main.setBackgroundColor('#fdf2f8');
        this.applyViewport();

        this.makeConfettiTexture();
        this.buildStaticUI();

        this.cardGroup = this.physics.add.group();
        this.physics.add.collider(this.cardGroup, this.cardGroup);

        this.setupDragHandlers();
        this.setupAudio();

        // Tata ulang UI kalau ukuran jendela berubah.
        this.scale.on('resize', this.onResize, this);

        const cleanup = () => {
            window.speechSynthesis?.cancel();
            this.scale?.off('resize', this.onResize, this);
        };
        this.events.once('shutdown', () => { cleanup(); this.sound.removeAll(); });
        this.events.once('destroy', cleanup);

        this.startRound();
    }

    // Hitung ruang desain dari ukuran kanvas: tinggi tetap 600, lebar mengikuti jendela.
    // Kanvas dirender lebih besar (gameConfig.js), jadi kamera di-zoom supaya semua
    // koordinat di file ini tetap memakai ruang desain.
    applyViewport() {
        const zoom = this.scale.height / H;
        this.W = this.scale.width / zoom;
        this.zone = { x: 20, y: ZONE_Y, w: this.W - 40, h: ZONE_H };
        this.endX = this.W - SIDE_PAD;

        this.cameras.main.setZoom(zoom).centerOn(this.W / 2, H / 2);
        this.physics.world.setBounds(0, FLOAT.top, this.W, FLOAT.bottom - FLOAT.top);
    }

    onResize() {
        this.applyViewport();
        this.layoutUI();
        this.layoutPlaced();
        this.cardGroup.getChildren().forEach((card) => {
            if (card.inZone) return;
            card.x = Phaser.Math.Clamp(card.x, 10, Math.max(10, this.W - card.width - 10));
        });
    }

    // Pembungkus this.add.text dengan resolusi tinggi.
    label(x, y, text, style) {
        return this.add.text(x, y, text, { resolution: TEXT_RES, ...style });
    }

    update() {
        if (!this.roundActive || this.settings.timerSeconds <= 0) return;

        const total = this.settings.timerSeconds * 1000;
        const remaining = Math.max(0, total - (this.time.now - this.roundStart));
        const secs = Math.ceil(remaining / 1000);

        if (secs !== this.lastSecs) {
            this.lastSecs = secs;
            this.timerText.setText(`Waktu: ${secs}`);
            this.timerText.setColor(secs <= 10 ? COLORS.bad : COLORS.text);
        }
        if (remaining <= 0) this.endRound('timeout');
    }

    // ==========================================
    // UI STATIS
    // ==========================================
    buildStaticUI() {
        this.bg = this.add.graphics();

        this.zoneLabel = this.label(0, 0, 'Taruh kata di sini', {
            fontFamily: FONT, fontSize: '22px', color: '#f9a8d4',
        }).setOrigin(0.5);

        const hud = { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLORS.text };
        this.roundText = this.label(20, 12, '', hud);
        this.scoreText = this.label(0, 12, '', hud).setOrigin(0.5, 0);
        this.timerText = this.label(0, 12, '', hud).setOrigin(1, 0);

        this.hintText = this.label(0, 46, '', {
            fontFamily: FONT, fontSize: '18px', color: COLORS.hint,
        }).setOrigin(0.5, 0);

        this.feedback = this.label(0, 512, '', {
            fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLORS.text,
            align: 'center', wordWrap: { width: 740 },
        }).setOrigin(0.5, 0);

        const y = 560;
        this.buttons = [
            this.makeButton(0, y, 'DENGAR', '#facc15', '#422006', () => this.speak()),
            this.makeButton(0, y, 'UNDO', '#3b82f6', '#ffffff', () => this.undoLast()),
            this.makeButton(0, y, 'CLEAR', '#64748b', '#ffffff', () => this.clearAll()),
            this.makeButton(0, y, 'CHECK', '#16a34a', '#ffffff', () => this.checkAnswer()),
            this.makeButton(0, y, 'LEWATI', '#be185d', '#ffffff', () => this.skipRound()),
        ];

        this.footer = null;
        if (this.settings.players > 1) {
            this.footer = this.label(0, H - 14, 'Mode 2 pemain belum tersedia, bermain 1 pemain.', {
                fontFamily: FONT, fontSize: '12px', color: '#9d174d',
            }).setOrigin(0.5, 1);
        }

        this.layoutUI();
    }

    // Posisikan ulang semua elemen UI sesuai lebar ruang desain saat ini.
    layoutUI() {
        const W = this.W;
        const z = this.zone;

        this.bg.clear();
        this.bg.fillStyle(0xffffff, 0.6);
        this.bg.fillRoundedRect(10, FLOAT.top - 4, W - 20, FLOAT.bottom - FLOAT.top + 8, 16);
        this.bg.fillStyle(0xffffff, 0.95);
        this.bg.fillRoundedRect(z.x, z.y, z.w, z.h, 16);
        this.bg.lineStyle(3, 0xf9a8d4, 1);
        this.bg.strokeRoundedRect(z.x, z.y, z.w, z.h, 16);

        this.zoneLabel.setPosition(z.x + z.w / 2, z.y + z.h / 2);
        this.scoreText.setX(W / 2);
        this.timerText.setX(W - 20);
        this.hintText.setX(W / 2);
        this.feedback.setX(W / 2).setWordWrapWidth(Math.min(W - 60, 900));

        const step = Math.min(W / 5, 170);
        this.buttons.forEach((button, i) => button.setX(W / 2 + (i - 2) * step));

        this.footer?.setX(W / 2);
        this.endObjs.forEach((obj) => obj.setX(W / 2));
    }

    makeButton(x, y, label, bg, color, onClick) {
        const button = this.label(x, y, label, {
            fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color,
            backgroundColor: bg, padding: { x: 18, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        button.on('pointerdown', onClick);
        return button;
    }

    makeConfettiTexture() {
        if (this.textures.exists('confetti')) return;
        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(0, 0, 10, 10);
        gfx.generateTexture('confetti', 10, 10);
        gfx.destroy();
    }

    updateHud() {
        this.roundText.setText(`Soal ${this.round}/${this.settings.rounds}`);
        this.scoreText.setText(`Poin: ${this.score}`);
        if (this.settings.timerSeconds <= 0) this.timerText.setText('Tanpa timer');
    }

    setFeedback(message, color = COLORS.text) {
        this.feedback.setText(message);
        this.feedback.setColor(color);
    }

    // ==========================================
    // RONDE
    // ==========================================
    buildRound() {
        const { pattern, wordBank, distractors } = this.settings;

        let slots;
        let sentence;
        for (let attempt = 0; attempt < 10; attempt++) {
            const used = {};
            slots = pattern.map((wordClass) => {
                const pool = wordBank[wordClass];
                const taken = (used[wordClass] ??= new Set());
                const fresh = pool.filter((w) => !taken.has(w));
                const word = Phaser.Utils.Array.GetRandom(fresh.length ? fresh : pool);
                taken.add(word);
                return { wordClass, word };
            });
            sentence = slots.map((s) => s.word).join(' ');
            if (!this.seenSentences.has(sentence)) break;   // hindari kalimat yang sama berulang
        }
        this.seenSentences.add(sentence);

        const target = slots.map((s) => s.word);
        const extra = generateDistractors({
            slots, wordBank, types: distractors.types, count: distractors.count,
        });

        return { target, cards: Phaser.Utils.Array.Shuffle([...target, ...extra]) };
    }

    startRound() {
        this.round += 1;
        this.clearCards();
        this.placed = [];
        this.history = [];
        this.lastSecs = null;
        this.setFeedback('');

        const { target, cards } = this.buildRound();
        this.target = target;

        cards.forEach((word) => {
            const card = this.createCard(word);
            const spot = this.randomFreeSpot(card);
            this.floatCard(card, spot.x, spot.y);
        });

        this.hintText.setText(
            this.settings.showPatternHint ? `Pola: ${this.settings.pattern.join(' + ')}` : ''
        );

        this.roundStart = this.time.now;
        this.roundActive = true;
        this.updateHud();

        // Bunyikan kalimat otomatis sebagai petunjuk. Tombol DENGAR untuk mengulang.
        this.time.delayedCall(400, () => this.speak());
    }

    clearCards() {
        this.cardGroup.getChildren().forEach((c) => this.tweens.killTweensOf(c));
        this.cardGroup.clear(true, true);
    }

    timeRatio() {
        const total = this.settings.timerSeconds * 1000;
        if (total <= 0) return 0;
        return Math.max(0, total - (this.time.now - this.roundStart)) / total;
    }

    checkAnswer() {
        if (!this.roundActive) return;

        if (this.placed.length === 0) {
            this.setFeedback('Susun kata dulu ya.', COLORS.hint);
            return;
        }

        const answer = this.placed.map((c) => c.word);
        const isCorrect = answer.length === this.target.length
            && answer.every((word, i) => word === this.target[i]);

        const { correct, wrong, timeBonus } = this.settings.scoring;

        if (isCorrect) {
            const gain = correct + Math.round(timeBonus * this.timeRatio());
            this.score += gain;
            this.endRound('correct', gain);
        } else {
            const before = this.score;
            this.score = Math.max(0, this.score - wrong);
            const lost = before - this.score;
            this.updateHud();
            this.playSfx('sfx-fail');
            this.setFeedback(lost > 0 ? `Belum tepat. -${lost} poin` : 'Belum tepat. Coba lagi!', COLORS.bad);
            this.cameras.main.shake(250, 0.01);
        }
    }

    skipRound() {
        if (this.roundActive) this.endRound('skip');
    }

    endRound(reason, gain = 0) {
        this.roundActive = false;

        if (reason === 'correct') {
            this.playSfx('sfx-success');
            this.setFeedback(`Benar! +${gain} poin`, COLORS.good);
            this.confetti();
        } else {
            this.playSfx('sfx-fail');
            const label = reason === 'timeout' ? 'Waktu habis' : 'Dilewati';
            this.setFeedback(`${label}. Jawaban: ${this.target.join(' ')}`, COLORS.bad);
        }
        this.updateHud();

        const delay = reason === 'correct' ? 1800 : 3000;
        this.time.delayedCall(delay, () => {
            if (this.round >= this.settings.rounds) this.showEnd();
            else this.startRound();
        });
    }

    showEnd() {
        this.clearCards();
        this.setFeedback('');
        this.hintText.setText('');

        const cx = this.W / 2;
        const panel = this.add.rectangle(cx, H / 2, 520, 300, 0xffffff)
            .setStrokeStyle(4, 0xec4899).setDepth(20).setInteractive();   // juga menahan klik ke bawahnya
        const title = this.label(cx, 220, 'Selesai!', {
            fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: COLORS.hint,
        }).setOrigin(0.5).setDepth(21);
        const total = this.label(cx, 290, `Skor akhir: ${this.score}`, {
            fontFamily: FONT, fontSize: '30px', color: COLORS.text,
        }).setOrigin(0.5).setDepth(21);
        const again = this.makeButton(cx, 370, 'MAIN LAGI', '#ec4899', '#ffffff', () => this.scene.restart(this.settings))
            .setDepth(21);
        this.endObjs = [panel, title, total, again];
    }

    // ==========================================
    // KARTU DAN DRAG AND DROP
    // ==========================================
    createCard(word) {
        const card = this.label(0, 0, word, {
            fontFamily: FONT, fontSize: '22px', color: '#ffffff',
            backgroundColor: COLORS.free, padding: { x: 14, y: 8 },
        });
        card.word = word;
        card.inZone = false;
        card.setInteractive({ useHandCursor: true });
        this.input.setDraggable(card);

        this.cardGroup.add(card);   // membuat body fisika otomatis
        card.body.setCollideWorldBounds(true);
        card.body.setBounce(1, 1);
        return card;
    }

    // Cari posisi acak di area melayang yang tidak menimpa kartu lain.
    randomFreeSpot(card) {
        const others = this.cardGroup.getChildren().filter((c) => c !== card && !c.inZone);
        let spot = { x: 20, y: FLOAT.top + 10 };

        for (let i = 0; i < 25; i++) {
            spot = {
                x: Phaser.Math.Between(10, Math.max(10, this.W - card.width - 10)),
                y: Phaser.Math.Between(FLOAT.top + 4, FLOAT.bottom - card.height - 4),
            };
            const rect = new Phaser.Geom.Rectangle(spot.x, spot.y, card.width, card.height);
            const overlaps = others.some((o) =>
                Phaser.Geom.Intersects.RectangleToRectangle(
                    rect, new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height)
                )
            );
            if (!overlaps) break;
        }
        return spot;
    }

    // Kartu kembali melayang (dengan atau tanpa animasi) lalu bergerak sesuai kecepatan setting.
    floatCard(card, x, y, animate = false) {
        card.inZone = false;
        card.setBackgroundColor(COLORS.free);

        const launch = () => {
            if (!card.active) return;
            card.body.reset(card.x, card.y);
            card.body.enable = true;
            const v = 90 * this.settings.wordSpeed;
            card.body.setVelocity(Phaser.Math.Between(-v, v), Phaser.Math.Between(-v, v));
        };

        if (animate) {
            this.tweens.add({ targets: card, x, y, duration: 250, ease: 'Power2', onComplete: launch });
        } else {
            card.setPosition(x, y);
            launch();
        }
    }

    setupDragHandlers() {
        this.input.on('dragstart', (pointer, card) => {
            if (!this.roundActive) return;
            this.tweens.killTweensOf(card);
            card.setDepth(10);
            card.body.enable = false;
            if (card.inZone) {
                this.removeFromZone(card);
                this.layoutPlaced();
            }
        });

        this.input.on('drag', (pointer, card, dragX, dragY) => {
            if (!this.roundActive) return;
            card.setPosition(dragX, dragY);
        });

        this.input.on('dragend', (pointer, card) => {
            if (!this.roundActive) return;
            card.setDepth(0);

            const cx = card.x + card.width / 2;
            const cy = card.y + card.height / 2;
            const z = this.zone;
            const inside = cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;

            if (inside) {
                this.placeInZone(card);
            } else {
                const y = Phaser.Math.Clamp(card.y, FLOAT.top, FLOAT.bottom - card.height);
                this.floatCard(card, card.x, y);
            }
        });
    }

    placeInZone(card) {
        card.inZone = true;
        card.body.enable = false;
        card.setBackgroundColor(COLORS.placed);

        // Cari posisi sisip berdasarkan baris dan posisi x saat dilepas.
        const dropRow = Phaser.Math.Clamp(
            Math.floor((card.y + card.height / 2 - this.zone.y - 5) / ROW_STEP), 0, ROW_Y.length - 1
        );
        const cx = card.x + card.width / 2;
        let index = this.placed.length;
        for (let i = 0; i < this.placed.length; i++) {
            const p = this.placed[i];
            if (p.slotRow > dropRow || (p.slotRow === dropRow && p.slotX + p.width / 2 > cx)) {
                index = i;
                break;
            }
        }
        this.placed.splice(index, 0, card);
        this.history.push(card);
        this.layoutPlaced();
    }

    removeFromZone(card) {
        this.placed = this.placed.filter((c) => c !== card);
        this.history = this.history.filter((c) => c !== card);
        card.inZone = false;
    }

    // Susun kartu di area susun dari kiri ke kanan, pindah baris kalau penuh.
    layoutPlaced() {
        let x = START_X;
        let row = 0;
        this.placed.forEach((card) => {
            if (x > START_X && x + card.width > this.endX) {
                row = Math.min(row + 1, ROW_Y.length - 1);
                x = START_X;
            }
            card.slotRow = row;
            card.slotX = x;
            this.tweens.killTweensOf(card);
            this.tweens.add({ targets: card, x, y: ROW_Y[row], duration: 180, ease: 'Power2' });
            x += card.width + GAP;
        });
    }

    undoLast() {
        if (!this.roundActive) return;
        const card = this.history[this.history.length - 1];
        if (!card) return;
        this.removeFromZone(card);
        this.layoutPlaced();
        const spot = this.randomFreeSpot(card);
        this.floatCard(card, spot.x, spot.y, true);
    }

    clearAll() {
        if (!this.roundActive) return;
        [...this.placed].forEach((card) => {
            this.removeFromZone(card);
            const spot = this.randomFreeSpot(card);
            this.floatCard(card, spot.x, spot.y, true);
        });
    }

    // ==========================================
    // AUDIO DAN EFEK
    // ==========================================
    setupAudio() {
        const { music, musicVolume, sfxVolume } = this.settings.audio;
        this.sfxVolume = sfxVolume;
        if (music && this.cache.audio.exists('bgm')) {
            this.sound.add('bgm', { loop: true, volume: musicVolume }).play();
        }
    }

    playSfx(key) {
        if (this.cache.audio.exists(key)) this.sound.play(key, { volume: this.sfxVolume });
    }

    // Membacakan kalimat target lewat suara bawaan browser (tanpa file audio).
    speak() {
        if (!this.roundActive || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(this.target.join(' '));
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
    }

    confetti() {
        const emitter = this.add.particles(this.W / 2, 480, 'confetti', {
            speed: { min: 200, max: 400 }, angle: { min: 220, max: 320 },
            gravityY: 300, lifespan: 2000, scale: { start: 1, end: 0 },
            tint: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff], emitting: false,
        });
        emitter.explode(50);
        this.time.delayedCall(2500, () => emitter.destroy());
    }
}