import Phaser from 'phaser';

const H = 600;
const GAP = 12;
const PANEL = { y: 110, h: 482 };

const LAYOUTS = {
    1: {
        zoneH: 124, floatY: 292, floatH: 176, rowStep: 50, rowOffset: 34, maxRows: 2,
        cardFont: 20, padX: 24, padY: 14, feedbackY: 474, btnY: 556, btn: {},
    },
    2: {
        zoneH: 150, floatY: 314, floatH: 148, rowStep: 44, rowOffset: 26, maxRows: 3,
        cardFont: 17, padX: 18, padY: 12, feedbackY: 468, btnY: 544,
        btn: { fontSize: 15, padX: 20, padY: 14 },
    },
};

const THEMES = [
    { border: 0xf9a8d4, fill: 0xfdf2f8, zone: 0xfff1f2, zoneLine: 0xef4444, name: '#be185d' },
    { border: 0x67e8f9, fill: 0xecfeff, zone: 0xf0fdff, zoneLine: 0x0891b2, name: '#0e7490' },
];

const FONT = 'Arial, sans-serif';
const TEXT_RES = 2;

const CARD_COLORS = [
    0xef4444,
    0xf97316,
    0xeab308,
    0x22c55e,
    0x06b6d4,
    0x3b82f6,
    0x8b5cf6,
    0xd946ef,
];

const COLORS = {
    placedBg: 0x16a34a,
    text: '#831843',
    hint: '#be185d',
    good: '#15803d',
    bad: '#b91c1c',
};

export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    init(data) {
        this.settings = data;
        this.round = 0;
        this.roundActive = false;
        this.queue = Phaser.Utils.Array.Shuffle([...data.sentences]).slice(0, data.rounds);
        this.sentenceText = '';
        this.target = [];
        this.endObjs = [];

        this.count = Math.min(2, Math.max(1, data.players || 1));
        this.L = LAYOUTS[this.count];

        this.players = Array.from({ length: this.count }, (_, i) => ({
            index: i,
            name: `Player ${i + 1}`,
            theme: THEMES[i],
            score: 0,
            done: false,
            placed: [],
            history: [],
            floatRect: new Phaser.Geom.Rectangle(),
        }));

        const replays = data.replays ?? 3;
        this.maxReplays = replays < 0 ? Infinity : replays;
        this.replaysLeft = this.maxReplays;
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

        if (this.count > 1) this.input.addPointer(1);

        this.setupAudio();
        this.scale.on('resize', this.onResize, this);

        const cleanup = () => {
            window.speechSynthesis?.cancel();
            this.scale?.off('resize', this.onResize, this);
        };

        this.events.once('shutdown', () => {
            cleanup();
            this.sound.removeAll();
        });
        this.events.once('destroy', cleanup);

        this.startRound();
    }

    applyViewport() {
        const zoom = this.scale.height / H;
        this.W = this.scale.width / zoom;

        const gap = 12;
        const panelW = (this.W - 20 - gap * (this.count - 1)) / this.count;

        this.players.forEach((p, i) => {
            const x = 10 + i * (panelW + gap);

            p.panel = { x, y: PANEL.y, w: panelW, h: PANEL.h };
            p.zone = { x: x + 12, y: 156, w: panelW - 24, h: this.L.zoneH };
            p.floatBox = {
                x: x + 12,
                y: this.L.floatY,
                w: panelW - 24,
                h: this.L.floatH,
            };

            p.floatRect.setTo(
                p.floatBox.x,
                p.floatBox.y,
                p.floatBox.w,
                p.floatBox.h,
            );

            p.startX = p.zone.x + 12;
            p.endX = p.zone.x + p.zone.w - 12;
        });

        this.cameras.main.setZoom(zoom).centerOn(this.W / 2, H / 2);
        this.physics.world.setBounds(0, this.L.floatY, this.W, this.L.floatH);
    }

    rowY(p, row) {
        return p.zone.y + this.L.rowOffset + row * this.L.rowStep;
    }

    onResize() {
        this.applyViewport();
        this.layoutUI();

        this.players.forEach((p) => this.layoutPlaced(p));

        this.cardGroup.getChildren().forEach((card) => {
            if (card.inZone) return;

            const f = this.players[card.owner].floatBox;
            card.x = Phaser.Math.Clamp(
                card.x,
                f.x + card.cardW / 2,
                f.x + f.w - card.cardW / 2,
            );
        });
    }

    label(x, y, text, style) {
        return this.add.text(x, y, text, {
            resolution: TEXT_RES,
            ...style,
        });
    }

    update() {
        if (!this.roundActive || this.settings.timerSeconds <= 0) return;

        const total = this.settings.timerSeconds * 1000;
        const remaining = Math.max(0, total - (this.time.now - this.roundStart));
        const secs = Math.ceil(remaining / 1000);

        if (secs !== this.lastSecs) {
            this.lastSecs = secs;
            this.timerText.setText(`Waktu ${secs}`);
            this.timerText.setColor(secs <= 10 ? '#fde047' : '#ffffff');
        }

        if (remaining <= 0) this.endRound('timeout');
    }

    makeButton(x, y, labelText, bgColor, textColor, onClick, opts = {}) {
        const {
            width = null,
            fontSize = 18,
            padX = 36,
            padY = 18,
        } = opts;

        const txt = this.label(0, 0, labelText, {
            fontFamily: FONT,
            fontSize: `${fontSize}px`,
            fontStyle: 'bold',
            color: textColor,
        }).setOrigin(0.5);

        const w = width ?? txt.width + padX;
        const h = txt.height + padY;
        const r = Math.min(16, h / 2);

        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.2);
        shadow.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r);

        const bg = this.add.graphics();
        bg.fillStyle(bgColor, 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

        const container = this.add.container(x, y, [shadow, bg, txt]);
        container.setSize(w, h);
        container.setInteractive({ useHandCursor: true });

        let pressed = false;

        const release = () => {
            if (!pressed) return;
            pressed = false;
            container.y -= 3;
            shadow.y += 3;
        };

        container.on('pointerdown', () => {
            pressed = true;
            container.y += 3;
            shadow.y -= 3;
            onClick();
        });

        container.on('pointerup', release);

        container.on('pointerout', () => {
            release();
            this.tweens.add({ targets: container, scale: 1, duration: 100 });
        });

        container.on('pointerover', () => {
            this.tweens.add({ targets: container, scale: 1.05, duration: 100 });
        });

        return container;
    }

    buildStaticUI() {
        this.bg = this.add.graphics();

        const white = {
            fontFamily: FONT,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#ffffff',
        };

        this.titleText = this.label(0, 0, 'Sentence Builder', {
            ...white,
            fontSize: '17px',
        }).setOrigin(0, 0.5);

        this.roundText = this.label(0, 0, '', white).setOrigin(0.5);
        this.timerText = this.label(0, 0, '', white).setOrigin(0.5);

        const small = { fontSize: 13, padX: 22, padY: 12 };

        this.btnRestart = this.makeButton(
            0, 0, 'Restart', 0xbe185d, '#ffffff',
            () => this.scene.restart(this.settings), small,
        );

        this.btnQuit = this.makeButton(
            0, 0, 'Quit', 0x9f1239, '#ffffff',
            () => window.dispatchEvent(new Event('game:quit')), small,
        );

        this.btnFull = this.makeButton(
            0, 0, 'Full Screen', 0xbe185d, '#ffffff',
            () => this.scale.toggleFullscreen(), small,
        );

        this.mascot = this.label(0, 0, '😼', {
            fontFamily: FONT,
            fontSize: '22px',
        }).setOrigin(0.5);

        this.listenBtn = this.makeButton(
            0, 0, '🔊 Listen to Sentence', 0xf59e0b, '#ffffff',
            () => this.replayAudio(),
            { width: 220, fontSize: 16, padY: 14 },
        );

        this.replayText = this.label(0, 0, '', {
            fontFamily: FONT,
            fontSize: '15px',
            fontStyle: 'bold',
            color: COLORS.text,
        }).setOrigin(0, 0.5);

        this.buildPlayerUI();
        this.layoutUI();
    }

    dashed(x1, y1, x2, y2, color, width = 2, dash = 8, gap = 6) {
        const g = this.bg;
        g.lineStyle(width, color, 1);

        const len = Phaser.Math.Distance.Between(x1, y1, x2, y2);
        const dx = (x2 - x1) / len;
        const dy = (y2 - y1) / len;

        for (let d = 0; d < len; d += dash + gap) {
            const e = Math.min(d + dash, len);
            g.lineBetween(
                x1 + dx * d,
                y1 + dy * d,
                x1 + dx * e,
                y1 + dy * e,
            );
        }
    }

    dashedRect(r, color) {
        this.dashed(r.x, r.y, r.x + r.w, r.y, color);
        this.dashed(r.x + r.w, r.y, r.x + r.w, r.y + r.h, color);
        this.dashed(r.x + r.w, r.y + r.h, r.x, r.y + r.h, color);
        this.dashed(r.x, r.y + r.h, r.x, r.y, color);
    }

    buildPlayerUI() {
        this.players.forEach((p) => {
            p.nameText = this.label(0, 0, p.name, {
                fontFamily: FONT,
                fontSize: '16px',
                fontStyle: 'bold',
                color: p.theme.name,
            }).setOrigin(0, 0.5);

            p.scoreText = this.label(0, 0, '', {
                fontFamily: FONT,
                fontSize: '16px',
                fontStyle: 'bold',
                color: COLORS.text,
            }).setOrigin(1, 0.5);

            p.zoneLabel = this.label(0, 0, 'Drop your word gems here...', {
                fontFamily: FONT,
                fontSize: '18px',
                fontStyle: 'italic',
                color: '#f9a8d4',
            }).setOrigin(0.5);

            p.feedback = this.label(0, 0, '', {
                fontFamily: FONT,
                fontSize: '15px',
                fontStyle: 'bold',
                color: COLORS.text,
                align: 'center',
                wordWrap: { width: 300 },
            }).setOrigin(0.5, 0);

            p.buttons = [
                this.makeButton(
                    0, 0, '↩ UNDO', 0x3b82f6, '#ffffff',
                    () => this.undoLast(p), this.L.btn,
                ),
                this.makeButton(
                    0, 0, '✖ CLEAR', 0xef4444, '#ffffff',
                    () => this.clearAll(p), this.L.btn,
                ),
                this.makeButton(
                    0, 0, '✔ CHECK', 0x22c55e, '#ffffff',
                    () => this.checkAnswer(p), this.L.btn,
                ),
            ];
        });
    }

    layoutUI() {
        const W = this.W;
        const L = this.L;
        const g = this.bg;

        g.clear();

        g.fillStyle(0xec4899, 1);
        g.fillRoundedRect(0, 0, W, 44, { tl: 0, tr: 0, bl: 18, br: 18 });
        g.fillStyle(0xffffff, 0.25);
        [198, 288].forEach((cx) => g.fillRoundedRect(cx - 42, 9, 84, 26, 13));

        const barW = Math.min(W - 20, 720);
        const barX = (W - barW) / 2;

        g.fillStyle(0xffffff, 0.85);
        g.fillRoundedRect(barX, 54, barW, 46, 23);
        g.lineStyle(3, 0xf59e0b, 1);
        g.strokeRoundedRect(barX, 54, barW, 46, 23);

        g.fillStyle(0xfef3c7, 1);
        g.fillCircle(barX + 30, 77, 19);
        g.lineStyle(2, 0xf59e0b, 1);
        g.strokeCircle(barX + 30, 77, 19);

        this.players.forEach((p) => {
            const { panel, zone, floatBox: f, theme } = p;

            g.fillStyle(0xffffff, 0.9);
            g.fillRoundedRect(panel.x, panel.y, panel.w, panel.h, 20);
            g.lineStyle(3, theme.border, 1);
            g.strokeRoundedRect(panel.x, panel.y, panel.w, panel.h, 20);

            this.dashed(
                panel.x + 14, 146,
                panel.x + panel.w - 14, 146,
                theme.border,
            );

            g.fillStyle(theme.zone, 1);
            g.fillRect(zone.x, zone.y, zone.w, zone.h);
            this.dashedRect(zone, theme.zoneLine);

            g.fillStyle(theme.fill, 1);
            g.fillRoundedRect(f.x, f.y, f.w, f.h, 16);
            g.lineStyle(2, theme.border, 1);
            g.strokeRoundedRect(f.x, f.y, f.w, f.h, 16);

            p.nameText.setPosition(panel.x + 18, 128);
            p.scoreText.setPosition(panel.x + panel.w - 18, 128);
            p.zoneLabel.setPosition(zone.x + zone.w / 2, zone.y + zone.h / 2);
            p.feedback
                .setPosition(panel.x + panel.w / 2, L.feedbackY)
                .setWordWrapWidth(panel.w - 30);

            const step = Math.min(150, (panel.w - 20) / 3);
            p.buttons.forEach((b, i) => {
                b.setPosition(
                    panel.x + panel.w / 2 + (i - 1) * step,
                    L.btnY,
                );
            });
        });

        this.titleText.setPosition(16, 22);
        this.roundText.setPosition(198, 22);
        this.timerText.setPosition(288, 22);

        let rx = W - 12;
        [this.btnFull, this.btnQuit, this.btnRestart].forEach((b) => {
            b.setPosition(rx - b.width / 2, 22);
            rx -= b.width + 8;
        });

        this.mascot.setPosition(barX + 30, 77);
        this.listenBtn.setPosition(W / 2 - 30, 77);
        this.replayText.setPosition(W / 2 + 96, 77);

        this.endObjs.forEach((obj) => obj.setX(W / 2));
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
        this.players.forEach((p) => p.scoreText.setText(`${p.score} PTS`));

        if (this.settings.timerSeconds <= 0) {
            this.timerText.setText('Tanpa timer');
        }
    }

    setFeedback(message, color = COLORS.text, p = null) {
        (p ? [p] : this.players).forEach((q) => {
            q.feedback.setText(message);
            q.feedback.setColor(color);
        });
    }

        buildRound() {
        const item = this.queue[this.round - 1];
        this.sentenceText = item.text;

        return {
            target: item.words,
            cards: Phaser.Utils.Array.Shuffle([
                ...item.words,
                ...item.distractors,
            ]),
        };
    }

    replayLabel() {
        return `Replays Left: ${
            Number.isFinite(this.replaysLeft) ? this.replaysLeft : '∞'
        }`;
    }

    replayAudio() {
        if (!this.roundActive || this.replaysLeft <= 0) return;

        this.speak();

        if (Number.isFinite(this.replaysLeft)) {
            this.replaysLeft--;
        }

        this.replayText.setText(this.replayLabel());
        this.listenBtn.setAlpha(this.replaysLeft > 0 ? 1 : 0.5);
    }

    startRound() {
        this.round++;
        this.clearCards();
        this.setFeedback('');
        this.lastSecs = null;

        this.replaysLeft = this.maxReplays;
        this.replayText.setText(this.replayLabel());
        this.listenBtn.setAlpha(this.replaysLeft > 0 ? 1 : 0.5);

        const { target, cards } = this.buildRound();
        this.target = target;

        this.players.forEach((p) => {
            p.placed = [];
            p.history = [];
            p.done = false;

            Phaser.Utils.Array.Shuffle([...cards]).forEach((word) => {
                const card = this.createCard(word, p);
                const spot = this.randomFreeSpot(card);
                this.floatCard(card, spot.x, spot.y);
            });
        });

        this.roundStart = this.time.now;
        this.roundActive = true;
        this.updateHud();

        this.time.delayedCall(400, () => this.speak());
    }

    clearCards() {
        if (!this.cardGroup) return;

        this.cardGroup.getChildren().forEach((card) => {
            this.tweens.killTweensOf(card);
        });

        this.cardGroup.clear(true, true);
    }

    timeRatio() {
        const total = this.settings.timerSeconds * 1000;
        if (total <= 0) return 0;

        return Math.max(
            0,
            total - (this.time.now - this.roundStart),
        ) / total;
    }

    checkAnswer(p) {
        if (!this.roundActive || p.done) return;

        if (p.placed.length === 0) {
            this.setFeedback('Susun kata dulu ya.', COLORS.hint, p);
            return;
        }

        const answer = p.placed.map((card) => card.word);

        const isCorrect =
            answer.length === this.target.length &&
            answer.every((word, i) => word === this.target[i]);

        const { correct, wrong, timeBonus } = this.settings.scoring;

        if (isCorrect) {
            const gain = correct + Math.round(timeBonus * this.timeRatio());

            p.score += gain;
            p.done = true;

            this.playSfx('sfx-success');
            this.setFeedback(`Benar! +${gain} poin`, COLORS.good, p);
            this.confetti(p);
            this.updateHud();

            if (this.players.every((player) => player.done)) {
                this.endRound('done');
            }
        } else {
            const before = p.score;
            p.score = Math.max(0, p.score - wrong);

            const lost = before - p.score;

            this.updateHud();
            this.playSfx('sfx-fail');

            this.setFeedback(
                lost > 0
                    ? `Belum tepat. -${lost} poin`
                    : 'Belum tepat. Coba lagi!',
                COLORS.bad,
                p,
            );

            this.cameras.main.shake(250, 0.006);
        }
    }

    endRound(reason) {
        this.roundActive = false;

        if (reason === 'timeout') {
            this.playSfx('sfx-fail');

            this.players
                .filter((p) => !p.done)
                .forEach((p) => {
                    this.setFeedback(
                        `Waktu habis. Jawaban: ${this.sentenceText}`,
                        COLORS.bad,
                        p,
                    );
                });
        }

        this.updateHud();

        const delay = reason === 'done' ? 1800 : 3000;

        this.time.delayedCall(delay, () => {
            if (this.round >= this.settings.rounds) {
                this.showEnd();
            } else {
                this.startRound();
            }
        });
    }

    showEnd() {
        this.clearCards();
        this.setFeedback('');

        this.listenBtn.setVisible(false);
        this.replayText.setVisible(false);
        this.mascot.setVisible(false);

        let body;

        if (this.count > 1) {
            const [a, b] = this.players;

            const winner = a.score === b.score
                ? 'Seri!'
                : `Pemenang: ${a.score > b.score ? a.name : b.name}`;

            body = `${a.name}: ${a.score} poin\n${b.name}: ${b.score} poin\n${winner}`;
        } else {
            body = `Skor akhir: ${this.players[0].score}`;
        }

        const pw = 480;
        const ph = this.count > 1 ? 340 : 280;

        const panelGfx = this.add.graphics();
        panelGfx.fillStyle(0xffffff, 1);
        panelGfx.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 24);
        panelGfx.lineStyle(4, 0xec4899, 1);
        panelGfx.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 24);

        const title = this.label(0, -ph / 2 + 50, 'Selesai!', {
            fontFamily: FONT,
            fontSize: '42px',
            fontStyle: 'bold',
            color: COLORS.hint,
        }).setOrigin(0.5);

        const total = this.label(0, -5, body, {
            fontFamily: FONT,
            fontSize: '26px',
            color: COLORS.text,
            align: 'center',
            lineSpacing: 6,
        }).setOrigin(0.5);

        const againBtn = this.makeButton(
            0,
            ph / 2 - 50,
            'MAIN LAGI',
            0xec4899,
            '#ffffff',
            () => this.scene.restart(this.settings),
        );

        const container = this.add.container(
            this.W / 2,
            H / 2,
            [panelGfx, title, total, againBtn],
        );

        container.setDepth(20);
        this.endObjs = [container];
    }

    createCard(word, p) {
        const L = this.L;

        const txt = this.label(0, 0, word, {
            fontFamily: FONT,
            fontSize: `${L.cardFont}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        const w = txt.width + L.padX;
        const h = txt.height + L.padY;
        const randomBgColor = Phaser.Utils.Array.GetRandom(CARD_COLORS);

        const bg = this.add.graphics();
        bg.fillStyle(randomBgColor, 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
        bg.lineStyle(2, 0xffffff, 0.5);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);

        const container = this.add.container(0, 0, [bg, txt]);

        container.setSize(w, h);
        container.word = word;
        container.owner = p.index;
        container.inZone = false;
        container.bgGfx = bg;
        container.cardW = w;
        container.cardH = h;
        container.baseColor = randomBgColor;

        container.setInteractive({ useHandCursor: true });
        this.input.setDraggable(container);

        this.cardGroup.add(container);

        container.body.setCollideWorldBounds(true);
        container.body.setBoundsRectangle(p.floatRect);
        container.body.setBounce(1, 1);

        return container;
    }

    updateCardBg(card, isPlaced) {
        card.bgGfx.clear();
        card.bgGfx.fillStyle(card.baseColor, 1);

        card.bgGfx.fillRoundedRect(
            -card.cardW / 2,
            -card.cardH / 2,
            card.cardW,
            card.cardH,
            14,
        );

        if (isPlaced) {
            card.bgGfx.lineStyle(4, 0x4ade80, 1);
        } else {
            card.bgGfx.lineStyle(2, 0xffffff, 0.5);
        }

        card.bgGfx.strokeRoundedRect(
            -card.cardW / 2,
            -card.cardH / 2,
            card.cardW,
            card.cardH,
            14,
        );
    }

    randomFreeSpot(card) {
        const f = this.players[card.owner].floatBox;

        const others = this.cardGroup.getChildren().filter(
            (other) =>
                other !== card &&
                other.owner === card.owner &&
                !other.inZone,
        );

        const minX = f.x + card.cardW / 2 + 4;
        const maxX = Math.max(minX, f.x + f.w - card.cardW / 2 - 4);

        let spot = {
            x: minX,
            y: f.y + card.cardH / 2 + 4,
        };

        for (let i = 0; i < 25; i++) {
            spot = {
                x: Phaser.Math.Between(minX, maxX),
                y: Phaser.Math.Between(
                    f.y + card.cardH / 2 + 4,
                    f.y + f.h - card.cardH / 2 - 4,
                ),
            };

            const rect = new Phaser.Geom.Rectangle(
                spot.x - card.cardW / 2,
                spot.y - card.cardH / 2,
                card.cardW,
                card.cardH,
            );

            const overlaps = others.some((other) =>
                Phaser.Geom.Intersects.RectangleToRectangle(
                    rect,
                    new Phaser.Geom.Rectangle(
                        other.x - other.cardW / 2,
                        other.y - other.cardH / 2,
                        other.cardW,
                        other.cardH,
                    ),
                ),
            );

            if (!overlaps) break;
        }

        return spot;
    }

        floatCard(card, x, y, animate = false) {
        card.inZone = false;
        this.updateCardBg(card, false);

        const launch = () => {
            if (!card.active) return;

            card.body.reset(card.x, card.y);
            card.body.enable = true;

            const v = 90 * this.settings.wordSpeed;

            card.body.setVelocity(
                Phaser.Math.Between(-v, v),
                Phaser.Math.Between(-v, v),
            );
        };

        if (animate) {
            this.tweens.add({
                targets: card,
                x,
                y,
                duration: 250,
                ease: 'Power2',
                onComplete: launch,
            });
        } else {
            card.setPosition(x, y);
            launch();
        }
    }

    setupDragHandlers() {
        this.input.on('dragstart', (pointer, card) => {
            const p = this.players[card.owner];

            if (!this.roundActive || p.done) return;

            this.tweens.killTweensOf(card);
            card.setDepth(10);
            card.body.enable = false;

            if (card.inZone) {
                this.removeFromZone(card);
                this.layoutPlaced(p);
            }
        });

        this.input.on('drag', (pointer, card, dragX, dragY) => {
            if (!this.roundActive || this.players[card.owner].done) return;

            card.setPosition(dragX, dragY);
        });

        this.input.on('dragend', (pointer, card) => {
            const p = this.players[card.owner];

            if (!this.roundActive || p.done) return;

            card.setDepth(0);

            // Kartu hanya bisa dimasukkan ke zona pemain pemiliknya.
            const z = p.zone;

            const inside =
                card.x >= z.x &&
                card.x <= z.x + z.w &&
                card.y >= z.y &&
                card.y <= z.y + z.h;

            if (inside) {
                this.placeInZone(card);
            } else {
                const f = p.floatBox;

                const x = Phaser.Math.Clamp(
                    card.x,
                    f.x + card.cardW / 2,
                    f.x + f.w - card.cardW / 2,
                );

                const y = Phaser.Math.Clamp(
                    card.y,
                    f.y + card.cardH / 2,
                    f.y + f.h - card.cardH / 2,
                );

                this.floatCard(card, x, y);
            }
        });
    }

    placeInZone(card) {
        const p = this.players[card.owner];

        card.inZone = true;
        card.body.enable = false;
        this.updateCardBg(card, true);

        const dropRow = Phaser.Math.Clamp(
            Math.floor((card.y - p.zone.y - 5) / this.L.rowStep),
            0,
            this.L.maxRows - 1,
        );

        let index = p.placed.length;

        for (let i = 0; i < p.placed.length; i++) {
            const other = p.placed[i];

            if (
                other.slotRow > dropRow ||
                (
                    other.slotRow === dropRow &&
                    other.slotX + other.cardW / 2 > card.x
                )
            ) {
                index = i;
                break;
            }
        }

        p.placed.splice(index, 0, card);
        p.history.push(card);

        this.layoutPlaced(p);
    }

    removeFromZone(card) {
        const p = this.players[card.owner];

        p.placed = p.placed.filter((item) => item !== card);
        p.history = p.history.filter((item) => item !== card);

        card.inZone = false;
    }

    layoutPlaced(p) {
        let x = p.startX;
        let row = 0;

        p.placed.forEach((card) => {
            if (x > p.startX && x + card.cardW > p.endX) {
                row = Math.min(row + 1, this.L.maxRows - 1);
                x = p.startX;
            }

            card.slotRow = row;
            card.slotX = x;

            this.tweens.killTweensOf(card);

            this.tweens.add({
                targets: card,
                x: x + card.cardW / 2,
                y: this.rowY(p, row),
                duration: 180,
                ease: 'Power2',
            });

            x += card.cardW + GAP;
        });
    }

    undoLast(p) {
        if (!this.roundActive || p.done) return;

        const card = p.history[p.history.length - 1];
        if (!card) return;

        this.removeFromZone(card);
        this.layoutPlaced(p);

        const spot = this.randomFreeSpot(card);

        this.floatCard(card, spot.x, spot.y, true);
    }

    clearAll(p) {
        if (!this.roundActive || p.done) return;

        [...p.placed].forEach((card) => {
            this.removeFromZone(card);

            const spot = this.randomFreeSpot(card);

            this.floatCard(card, spot.x, spot.y, true);
        });
    }

    setupAudio() {
        const { music, musicVolume, sfxVolume } = this.settings.audio;

        this.sfxVolume = sfxVolume;

        if (music && this.cache.audio.exists('bgm')) {
            this.sound.add('bgm', {
                loop: true,
                volume: musicVolume,
            }).play();
        }
    }

    playSfx(key) {
        if (this.cache.audio.exists(key)) {
            this.sound.play(key, { volume: this.sfxVolume });
        }
    }

    speak() {
        if (!this.roundActive || !('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(this.sentenceText);

        utterance.lang = 'en-US';
        utterance.rate = 0.85;

        window.speechSynthesis.speak(utterance);
    }

    confetti(p) {
        const emitter = this.add.particles(
            p.panel.x + p.panel.w / 2,
            this.L.feedbackY,
            'confetti',
            {
                speed: { min: 200, max: 400 },
                angle: { min: 220, max: 320 },
                gravityY: 300,
                lifespan: 2000,
                scale: { start: 1, end: 0 },
                tint: [
                    0xff0000,
                    0x00ff00,
                    0x0000ff,
                    0xffff00,
                    0xff00ff,
                ],
                emitting: false,
            },
        );

        emitter.explode(50);

        this.time.delayedCall(2500, () => emitter.destroy());
    }
}