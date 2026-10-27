import './style.css';
import { startGame, stopGame } from './game/sentences-builder/gameConfig';

// ==========================================
// PENGATURAN AUDIO (Sesuaikan nama file di folder public/assets/audio/)
// ==========================================
const MUSIC_OPTIONS = [
    { label: 'Tanpa musik', src: null },
    // Diperbaiki: menghapus duplikasi /assets/assets/ menjadi /assets/audio/
    { label: 'Music Happy', src: '/assets/audio/music-happy.mp3' },
];

const SUCCESS_OPTIONS = [
    { label: 'Tanpa suara', src: null },
    { label: 'Correct 1',   src: '/assets/audio/correct.mp3' },
    { label: 'Correct 2',   src: '/assets/audio/correct1.mp3' },
];

const FAIL_OPTIONS = [
    { label: 'Tanpa suara', src: null },
    { label: 'Wrong 1',     src: '/assets/audio/wrong.mp3' },
    { label: 'Wrong 2',     src: '/assets/audio/wrong1.mp3' },
];

// ==========================================
// STATE
// ==========================================
const sentences = []; // Menyimpan data: [{ text: '', distractors: '' }]

// ==========================================
// ELEMEN DOM
// ==========================================
const $ = (id) => document.getElementById(id);

const sentenceList = $('sentence-list');
const setupScreen = $('setup-screen');
const gameScreen = $('game-screen');
const roundsInput = $('rounds');
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
// LOGIKA PEMROSESAN KALIMAT
// ==========================================
// Menghapus tanda baca di awal/akhir kata: "today." menjadi "today"
const stripEdges = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const tokenize = (text) => text.split(/\s+/).map(stripEdges).filter(Boolean);

function parseDistractors(text, sentenceWords) {
    const taken = new Set(sentenceWords.map((w) => w.toLowerCase())); // Pengecoh tidak boleh sama dengan kata di kalimat
    const result = [];
    
    text.split(',').forEach((raw) => {
        const word = stripEdges(raw.trim().replace(/\s+/g, ' '));
        const key = word.toLowerCase();
        
        if (!word || taken.has(key)) return;
        
        taken.add(key);
        result.push(word);
    });
    
    return result;
}

function makeField(labelText, placeholder, value, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'mt-3';
    
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = labelText;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field';
    input.placeholder = placeholder;
    input.value = value;
    input.autocomplete = 'off';
    input.addEventListener('input', () => { 
        onInput(input.value); 
        hideError(); 
    });
    
    wrap.append(label, input);
    return wrap;
}

function renderSentences() {
    sentenceList.replaceChildren();

    sentences.forEach((item, index) => {
        const box = document.createElement('div');
        box.className = 'rounded-2xl border border-pink-200 bg-white p-4';

        const head = document.createElement('div');
        head.className = 'flex items-center justify-between gap-2';
        
        const title = document.createElement('span');
        title.className = 'text-sm font-bold text-pink-700';
        title.textContent = `Kalimat ${index + 1}`;
        
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300';
        remove.textContent = 'Hapus';
        remove.addEventListener('click', () => {
            sentences.splice(index, 1);
            renderSentences();
        });
        
        head.append(title, remove);

        box.append(
            head,
            makeField('Kalimat', 'Contoh: She plays football every day.', item.text, (v) => { item.text = v; }),
            makeField('Wrong distractor words (pisahkan dengan koma)', 'Contoh: played, school, blue', item.distractors, (v) => { item.distractors = v; }),
        );
        
        sentenceList.append(box);
    });
}

$('btn-add-sentence').addEventListener('click', () => {
    sentences.push({ text: '', distractors: '' });
    renderSentences();
    sentenceList.lastElementChild?.querySelector('input')?.focus();
});

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
    if(out) {
        range.addEventListener('input', () => { out.textContent = `${range.value}%`; });
    }
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
        audioNote.textContent = `File audio tidak bisa diputar: ${src}. Pastikan file ada di folder public/assets/audio/.`;
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
    const filled = sentences.map((item, i) => ({ item, i })).filter(({ item }) => item.text.trim());
    
    if (filled.length === 0) {
        return { message: 'Tambahkan minimal satu kalimat.', target: sentenceList };
    }
    
    const tooShort = filled.find(({ item }) => tokenize(item.text).length < 2);
    if (tooShort) {
        return { message: `Kalimat ${tooShort.i + 1} minimal terdiri dari 2 kata.`, target: sentenceList.children[tooShort.i] };
    }
    
    return null;
}

function readInt(input, min, max, fallback) {
    const n = parseInt(input.value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function collectSettings() {
    const items = sentences
        .filter((item) => item.text.trim())
        .map((item) => {
            const words = tokenize(item.text);
            return { text: item.text.trim(), words, distractors: parseDistractors(item.distractors, words) };
        });

    return {
        sentences: items,
        rounds: Math.min(readInt(roundsInput, 1, 50, 5), items.length),
        timerSeconds: Number(timerSelect.value),
        wordSpeed: Number(speedSelect.value),
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

    showScreen('game'); // tampilkan dulu supaya Phaser membaca ukuran #app dengan benar
    startGame(settings);
});

$('btn-back').addEventListener('click', () => {
    stopGame();
    showScreen('setup');
});

// Inisialisasi awal UI
sentences.push({ text: '', distractors: '' });
renderSentences();