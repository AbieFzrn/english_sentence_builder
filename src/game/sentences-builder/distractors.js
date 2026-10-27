import nlp from 'compromise';

// ==========================================
// Pembuat kata pengecoh (distractor)
// Pasang dulu: npm install compromise
// ==========================================

// Tabel kecil bentuk pronoun yang salah. Kuncinya huruf kecil.
const PRONOUN_SWAPS = {
    i: ['me', 'my'], me: ['I'],
    you: ['your'],
    he: ['him', 'his'], him: ['he'],
    she: ['her'], her: ['she'],
    it: ['its'],
    we: ['us', 'our'], us: ['we'],
    they: ['them', 'their'], them: ['they'],
};

function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Samakan huruf besar/kecil kata baru dengan kata aslinya.
function matchCase(original, candidate) {
    if (!candidate) return candidate;
    if (original === 'I') return candidate.toLowerCase();
    if (original.length > 1 && original === original.toUpperCase()) return candidate.toUpperCase();
    const first = original[0];
    if (first !== first.toLowerCase()) return candidate[0].toUpperCase() + candidate.slice(1);
    return candidate;
}

const isSingleWord = (word) => !/\s/.test(word);

// compromise salah menghasilkan "interestinger", jadi comparative hanya
// dibuat untuk adjective pendek (maksimal 2 suku kata).
function isShortAdjective(word) {
    if (!isSingleWord(word)) return false;
    const syllables = (word.toLowerCase().match(/[aeiouy]+/g) || []).length;
    return syllables <= 2 && !/(ing|ed|ful|ous|ive|less|al)$/i.test(word);
}

// Setiap builder menerima satu slot { wordClass, word } dan mengembalikan
// daftar kata pengecoh yang mungkin. Hasil yang sama dengan kata asli dibuang nanti.
const BUILDERS = {
    verbTense({ wordClass, word }) {
        if (wordClass !== 'Verb' || !isSingleWord(word)) return [];
        const f = nlp(word).tag('Verb').verbs().conjugate()[0];
        if (!f) return [];
        const participle = f.Participle ?? f.PastTense;
        const aux = /[^s]s$/i.test(word) ? 'has' : 'have';
        return [
            f.Infinitive, f.PresentTense, f.PastTense, f.Gerund, f.FutureTense,
            participle ? `${aux} ${participle}` : null,
        ].filter(Boolean).map((w) => matchCase(word, w));
    },

    nounNumber({ wordClass, word }) {
        if (wordClass !== 'Noun') return [];
        const plural = nlp(word).tag('Noun').nouns().toPlural().text();
        const singular = nlp(word).tag('Noun').nouns().toSingular().text();
        return [plural, singular];
    },

    pronounCase({ wordClass, word }) {
        if (wordClass !== 'Pronoun' && wordClass !== 'Subject') return [];
        return (PRONOUN_SWAPS[word.toLowerCase()] ?? []).map((w) => matchCase(word, w));
    },

    adjectiveDegree({ wordClass, word }) {
        if (wordClass !== 'Adjective' || !isShortAdjective(word)) return [];
        const f = nlp(word).tag('Adjective').adjectives().conjugate()[0];
        return f ? [f.Comparative, f.Superlative].filter(Boolean) : [];
    },

    // Hanya adverb -> adjective (quickly -> quick). Arah sebaliknya sering
    // menghasilkan kata yang tidak ada, misalnya "bigly".
    adverbAdjective({ wordClass, word }) {
        if (wordClass !== 'Adverb' || !isSingleWord(word)) return [];
        const f = nlp(word).tag('Adverb').adverbs().conjugate()[0];
        return f?.Adjective ? [f.Adjective] : [];
    },

    articleAAn({ wordClass, word }) {
        if (wordClass !== 'Article') return [];
        const lower = word.toLowerCase();
        if (lower === 'a') return [matchCase(word, 'an')];
        if (lower === 'an') return [matchCase(word, 'a')];
        return [];
    },

    // Kata dari kelas lain di bank kata guru.
    crossClass({ wordClass }, wordBank) {
        return Object.entries(wordBank)
            .filter(([cls]) => cls !== wordClass)
            .flatMap(([, words]) => words);
    },
};


export function generateDistractors({ slots, wordBank, types, count }) {
    if (!count || !types?.length) return [];

    const seen = new Set(slots.map((s) => s.word.toLowerCase()));
    const pool = [];

    const add = (word) => {
        const clean = word?.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        pool.push(clean);
    };

    slots.forEach((slot) => {
        types.forEach((type) => {
            try {
                (BUILDERS[type]?.(slot, wordBank) ?? []).forEach(add);
            } catch (err) {
                console.warn(`Distractor "${type}" gagal untuk "${slot.word}"`, err);
            }
        });
    });

    return shuffle(pool).slice(0, count);
}