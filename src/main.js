import './style.css';
import { startGame, stopGame } from './game/sentences-builder/gameConfig';

// ==========================================
// KONFIGURASI STATIS
// ==========================================
const AVAILABLE_CLASSES = [
    'Subject', 'Verb', 'Object', 'Modal', 'Adverb',
    'Adjective', 'Preposition', 'Article', 'Location', 'Noun', 'Pronoun',
];

// needs      : checkbox aktif kalau pola punya salah satu tag ini
// minClasses : checkbox aktif kalau pola punya minimal sekian kelas berbeda
const DISTRACTOR_TYPES = [
    { id: 'verbTense',       label: 'Tense verb (past, perfect, continuous)', needs: ['Verb'] },
    { id: 'nounNumber',      label: 'Singular / plural noun',                 needs: ['Noun'] },
    { id: 'pronounCase',     label: 'Case pronoun (she → her)',               needs: ['Pronoun', 'Subject'] },
    { id: 'adjectiveDegree', label: 'Comparative / superlative adjective',    needs: ['Adjective'] },
    { id: 'adverbAdjective', label: 'Adverb ↔ adjective',                     needs: ['Adverb'] },
    { id: 'articleAAn',      label: 'Article a / an',                         needs: ['Article'] },
    { id: 'crossClass',      label: 'Lintas kelas (kata dari kelas lain)',    minClasses: 2 },
];

// File audio taruh di folder public/audio/ (nama file bebas, sesuaikan di sini).
const MUSIC_OPTIONS = [
    { label: 'Tanpa musik', src: null },
    { label: 'Ceria',       src: '/audio/music-happy.mp3' },
    { label: 'Santai',      src: '/audio/music-chill.mp3' },
    { label: 'Petualangan', src: '/audio/music-adventure.mp3' },
];
const SUCCESS_OPTIONS = [
    { label: 'Tanpa suara',  src: null },
    { label: 'Ding',         src: '/audio/success-ding.mp3' },
    { label: 'Tepuk tangan', src: '/audio/success-clap.mp3' },
];
const FAIL_OPTIONS = [
    { label: 'Tanpa suara', src: null },
    { label: 'Buzzer',      src: '/audio/fail-buzz.mp3' },
    { label: 'Wah',         src: '/audio/fail-wah.mp3' },
];

// ==========================================
// STATE
// ==========================================
let pattern = [];                 // contoh: ['Subject', 'Verb', 'Object']
const wordsByClass = {};          // contoh: { Verb: ['plays', 'reads'] }
const distractorChecked = Object.fromEntries(DISTRACTOR_TYPES.map((t) => [t.id, true]));

// ==========================================
// ELEMEN DOM
// ==========================================
const $ = (id) => document.getElementById(id);

const setupScreen = $('setup-screen');
const gameScreen = $('game-screen');
const patternContainer = $('pattern-container');
const wordsContainer = $('words-container');
const wordsEmpty = $('words-empty');
const classMenu = $('class-menu');
const distractorTypesEl = $('distractor-types');
const distractorNote = $('distractor-note');
const distractorCountInput = $('distractor-count');
const roundsInput = $('rounds');
const showHintInput = $('show-hint');
const timerSelect = $('timer');
const speedSelect = $('word-speed');
const playersSelect = $('players');
const scoreCorrect = $('score-correct');
const scoreWrong = $('score-wrong');
const scoreBonus = $('score-bonus');
const musicSelect = $('music-select');
const successSelect = $('success-select');
const failSelect = $('fail-select');
const musicVolume = $('music-volume');
const sfxVolume = $('sfx-volume');
const audioNote = $('audio-note');
const formError = $('form-error');

// ==========================================
// POLA KATA (TAG + TOMBOL +)
// ==========================================
let menuInsertIndex = 0;

function makeTagChip(wordClass, index) {
    const chip = document.createElement('div');
    chip.className = 'flex items-center gap-2 rounded-full border border-pink-300 bg-pink-100 px-3 py-1 text-sm font-semibold text-pink-800';

    const label = document.createElement('span');
    label.textContent = wordClass;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'font-bold text-pink-600 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-pink-400 rounded-full px-1';
    remove.setAttribute('aria-label', `Hapus ${wordClass}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
        pattern.splice(index, 1);
        renderPattern();
    });

    chip.append(label, remove);
    return chip;
}

function makePlusButton(insertIndex, showLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.plus = '1';
    btn.className = 'flex h-8 items-center justify-center rounded-full border border-dashed border-pink-400 bg-white px-3 text-sm font-bold text-pink-600 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-400';
    btn.textContent = showLabel ? '+ Tambah kelas kata' : '+';
    btn.setAttribute('aria-label', 'Tambah kelas kata');
    btn.addEventListener('click', () => openClassMenu(btn, insertIndex));
    return btn;
}

function renderPattern() {
    patternContainer.replaceChildren();

    if (pattern.length === 0) {
        patternContainer.append(makePlusButton(0, true));
    } else {
        pattern.forEach((wordClass, index) => {
            patternContainer.append(makeTagChip(wordClass, index), makePlusButton(index + 1, false));
        });
    }

    renderWordSections();
    renderDistractorTypes();
    hideError();
}

function openClassMenu(anchor, insertIndex) {
    menuInsertIndex = insertIndex;
    classMenu.replaceChildren();

    AVAILABLE_CLASSES.forEach((wordClass) => {
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'block w-full px-4 py-2 text-left text-sm hover:bg-pink-100 focus:bg-pink-100 focus:outline-none';
        option.textContent = wordClass;
        option.addEventListener('click', () => {
            pattern.splice(menuInsertIndex, 0, wordClass);
            closeClassMenu();
            renderPattern();
        });
        item.append(option);
        classMenu.append(item);
    });

    const rect = anchor.getBoundingClientRect();
    classMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 176))}px`;
    classMenu.style.top = `${rect.bottom + 6}px`;
    classMenu.classList.remove('hidden');
    classMenu.querySelector('button')?.focus();
}

function closeClassMenu() {
    classMenu.classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (!classMenu.contains(e.target) && !e.target.closest('[data-plus]')) closeClassMenu();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeClassMenu();
});
window.addEventListener('scroll', closeClassMenu, { passive: true });
window.addEventListener('resize', closeClassMenu);

// ==========================================
// FORM KATA PER KELAS (ENTER = 1 KATA)
// ==========================================
function buildWordBlock(wordClass) {
    const uses = pattern.filter((c) => c === wordClass).length;
    const list = (wordsByClass[wordClass] ??= []);

    const block = document.createElement('div');
    block.dataset.class = wordClass;
    block.className = 'rounded-2xl border border-pink-200 bg-white p-4';

    const header = document.createElement('div');
    header.className = 'flex items-baseline justify-between gap-2';

    const title = document.createElement('h3');
    title.className = 'text-base font-bold text-pink-700';
    title.textContent = wordClass;
    header.append(title);

    if (uses > 1) {
        const badge = document.createElement('span');
        badge.className = 'text-xs text-gray-500';
        badge.textContent = `dipakai ${uses}× di pola`;
        header.append(badge);
    }

    const chips = document.createElement('div');
    chips.className = 'mt-3 flex flex-wrap gap-2';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field mt-3';
    input.placeholder = 'Ketik kata lalu tekan Enter';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Tambah kata untuk ${wordClass}`);

    const message = document.createElement('p');
    message.className = 'mt-1 min-h-[1rem] text-xs text-red-600';

    function drawChips() {
        chips.replaceChildren();
        list.forEach((word, index) => {
            const chip = document.createElement('span');
            chip.className = 'flex items-center gap-2 rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-sm';

            const text = document.createElement('span');
            text.textContent = word;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'font-bold text-red-500 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-pink-400 rounded-full px-1';
            remove.setAttribute('aria-label', `Hapus kata ${word}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                list.splice(index, 1);
                drawChips();
            });

            chip.append(text, remove);
            chips.append(chip);
        });
    }

    function addWord() {
        const word = input.value.trim().replace(/\s+/g, ' ');
        if (!word) return;
        if (list.some((w) => w.toLowerCase() === word.toLowerCase())) {
            message.textContent = 'Kata itu sudah ada.';
            return;
        }
        list.push(word);
        input.value = '';
        message.textContent = '';
        hideError();
        drawChips();
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWord();
        } else if (e.key === 'Backspace' && input.value === '' && list.length > 0) {
            list.pop();
            drawChips();
        }
    });
    input.addEventListener('input', () => { message.textContent = ''; });

    drawChips();
    block.append(header, chips, input, message);
    return block;
}

function renderWordSections() {
    wordsContainer.replaceChildren();
    const uniqueClasses = [...new Set(pattern)];
    wordsEmpty.classList.toggle('hidden', uniqueClasses.length > 0);
    uniqueClasses.forEach((wordClass) => wordsContainer.append(buildWordBlock(wordClass)));
}

// ==========================================
// CHECKBOX JENIS DISTRACTOR
// ==========================================
function isTypeEnabled(type) {
    const unique = new Set(pattern);
    if (type.needs) return type.needs.some((c) => unique.has(c));
    return unique.size >= type.minClasses;
}

function getActiveTypeIds() {
    return DISTRACTOR_TYPES
        .filter((t) => isTypeEnabled(t) && distractorChecked[t.id])
        .map((t) => t.id);
}

function syncDistractorCount() {
    const hasActive = getActiveTypeIds().length > 0;
    distractorCountInput.disabled = !hasActive;
    const anyEnabled = DISTRACTOR_TYPES.some(isTypeEnabled);
    if (!anyEnabled) {
        distractorNote.textContent = 'Tambahkan tag di pola (misalnya Verb atau Noun) agar jenis distractor tersedia.';
    } else if (!hasActive) {
        distractorNote.textContent = 'Centang minimal satu jenis distractor, atau biarkan tanpa distractor.';
    } else {
        distractorNote.textContent = '';
    }
}

function renderDistractorTypes() {
    distractorTypesEl.replaceChildren();

    DISTRACTOR_TYPES.forEach((type) => {
        const enabled = isTypeEnabled(type);

        const label = document.createElement('label');
        label.className = enabled
            ? 'flex cursor-pointer items-center gap-2 rounded-2xl border border-pink-200 bg-white px-3 py-2 text-sm'
            : 'flex cursor-not-allowed items-center gap-2 rounded-2xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-400';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'accent-pink-500';
        checkbox.disabled = !enabled;
        checkbox.checked = enabled && distractorChecked[type.id];
        checkbox.addEventListener('change', () => {
            distractorChecked[type.id] = checkbox.checked;
            syncDistractorCount();
        });

        const text = document.createElement('span');
        text.textContent = type.label;

        label.append(checkbox, text);
        distractorTypesEl.append(label);
    });

    syncDistractorCount();
}

// ==========================================
// MUSIK, EFEK SUARA, DAN VOLUME
// ==========================================
function fillSelect(select, options) {
    options.forEach((o) => select.add(new Option(o.label, o.src ?? '')));
}
fillSelect(musicSelect, MUSIC_OPTIONS);
fillSelect(successSelect, SUCCESS_OPTIONS);
fillSelect(failSelect, FAIL_OPTIONS);

document.querySelectorAll('input[type="range"]').forEach((range) => {
    const out = $(`${range.id}-out`);
    range.addEventListener('input', () => { out.textContent = `${range.value}%`; });
});

let previewAudio = null;
let previewTimer = null;

function stopPreview() {
    clearTimeout(previewTimer);
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
}

function playPreview(src, volume, maxMs) {
    stopPreview();
    audioNote.textContent = '';
    if (!src) return;

    previewAudio = new Audio(src);
    previewAudio.volume = volume;
    previewAudio.play().catch(() => {
        audioNote.textContent = `File audio tidak bisa diputar: ${src}. Pastikan file ada di folder public/audio/.`;
    });
    if (maxMs) previewTimer = setTimeout(stopPreview, maxMs);
}

$('preview-music').addEventListener('click', () => playPreview(musicSelect.value, musicVolume.value / 100, 5000));
$('preview-success').addEventListener('click', () => playPreview(successSelect.value, sfxVolume.value / 100));
$('preview-fail').addEventListener('click', () => playPreview(failSelect.value, sfxVolume.value / 100));

// ==========================================
// VALIDASI DAN PENGUMPULAN DATA
// ==========================================
function showError(message, target) {
    formError.textContent = message;
    formError.classList.remove('hidden');
    (target ?? formError).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
    formError.classList.add('hidden');
}

function validate() {
    if (pattern.length < 2) {
        return { message: 'Pola kata minimal berisi 2 kelas kata. Klik tombol + untuk menambah.', target: patternContainer };
    }
    for (const wordClass of new Set(pattern)) {
        if (!wordsByClass[wordClass] || wordsByClass[wordClass].length === 0) {
            return {
                message: `Isi minimal satu kata untuk kelas ${wordClass}.`,
                target: wordsContainer.querySelector(`[data-class="${wordClass}"]`),
            };
        }
    }
    return null;
}

function readInt(input, min, max, fallback) {
    const n = parseInt(input.value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function collectSettings() {
    const wordBank = {};
    [...new Set(pattern)].forEach((wordClass) => {
        wordBank[wordClass] = [...wordsByClass[wordClass]];
    });

    const activeTypes = getActiveTypeIds();

    return {
        pattern: [...pattern],
        // Sementara, dipakai mainScene lama. Hapus setelah mainScene baru jadi.
        validPatterns: [[...pattern]],
        wordBank,
        rounds: readInt(roundsInput, 1, 50, 5),
        distractors: {
            count: activeTypes.length ? readInt(distractorCountInput, 0, 8, 2) : 0,
            types: activeTypes,
        },
        showPatternHint: showHintInput.checked,
        timerSeconds: Number(timerSelect.value),   // 0 = tanpa timer
        wordSpeed: Number(speedSelect.value),      // pengali kecepatan, 0 = diam
        players: Number(playersSelect.value),
        scoring: {
            correct: readInt(scoreCorrect, 0, 1000, 100),
            wrong: readInt(scoreWrong, 0, 1000, 10),
            timeBonus: readInt(scoreBonus, 0, 1000, 50),
        },
        audio: {
            music: musicSelect.value || null,
            musicVolume: musicVolume.value / 100,
            success: successSelect.value || null,
            fail: failSelect.value || null,
            sfxVolume: sfxVolume.value / 100,
        },
    };
}

// ==========================================
// PINDAH LAYAR DAN MULAI GAME
// ==========================================
function showScreen(name) {
    setupScreen.classList.toggle('hidden', name !== 'setup');
    gameScreen.classList.toggle('hidden', name !== 'game');
    window.scrollTo({ top: 0 });
}

$('btn-play').addEventListener('click', () => {
    const problem = validate();
    if (problem) {
        showError(problem.message, problem.target);
        return;
    }

    hideError();
    stopPreview();

    const settings = collectSettings();
    console.log('Pengaturan game:', settings);

    showScreen('game');   // tampilkan dulu supaya Phaser membaca ukuran #app dengan benar
    startGame(settings);
});

$('btn-back').addEventListener('click', () => {
    stopGame();
    showScreen('setup');
});

// Render awal
renderPattern();