/*
 * Matcher: normalizes words (English + Arabic) and tracks which word of the
 * text the child has reached, given the live speech-recognition transcript.
 * Pure logic, no DOM — also loadable in Node for tests.
 */
(function (root) {
  'use strict';

  const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
  const AR_RANGE = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
  const AR_CHARS = new RegExp('[' + AR_RANGE + ']', 'g');
  const AR_TEST = new RegExp('[' + AR_RANGE + ']');

  const EN_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen', 'twenty'];

  function detectLang(text) {
    const letters = (text.match(/\p{L}/gu) || []).length;
    const arabic = (text.match(AR_CHARS) || []).length;
    return letters > 0 && arabic / letters > 0.3 ? 'ar' : 'en';
  }

  function normalize(word, lang) {
    let w = String(word).normalize('NFC').toLowerCase();
    if (lang === 'ar' || AR_TEST.test(w)) {
      w = w.replace(AR_DIACRITICS, '')
        .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, '\u0627') // آ أ إ ٱ -> ا
        .replace(/\u0649/g, '\u064A')                                  // ى -> ي
        .replace(/\u0629/g, '\u0647')                                  // ة -> ه
        .replace(/\u0624/g, '\u0648')                                  // ؤ -> و
        .replace(/\u0626/g, '\u064A')                                  // ئ -> ي
        .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)); // ٣ -> 3
    }
    // strip accents on latin letters, then anything that's not a letter/digit
    w = w.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFC');
    w = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (/^\d+$/.test(w) && lang !== 'ar' && +w <= 20) w = EN_NUMBERS[+w];
    return w;
  }

  /** Split a transcript into normalized words (empty ones removed). */
  function words(text, lang) {
    return String(text).split(/\s+/).map(w => normalize(w, lang)).filter(Boolean);
  }

  /**
   * Tokenize the text to learn. Returns tokens:
   *   { display, norm, br }  where br = number of line breaks before this token.
   * Pure punctuation (e.g. "—", "۝") is glued onto the previous token's display.
   */
  function tokenize(text, lang) {
    const tokens = [];
    let pendingBr = 0;
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((line, li) => {
      if (li > 0) pendingBr++;
      line.split(/\s+/).filter(Boolean).forEach(raw => {
        const norm = normalize(raw, lang);
        if (!norm) {
          if (tokens.length) tokens[tokens.length - 1].display += ' ' + raw;
          return;
        }
        tokens.push({ display: raw, norm, br: tokens.length ? Math.min(pendingBr, 2) : 0 });
        pendingBr = 0;
      });
    });
    return tokens;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function stripArPrefix(w) {
    // leading conjunction "و" / "ف" is often split off or merged by recognizers
    return w.length > 3 && (w[0] === 'و' || w[0] === 'ف') ? w.slice(1) : w;
  }

  // Letters that children, dialects and recognizers commonly swap.
  // (ق is said as ك, ء or g depending on the child / dialect.)
  const AR_FOLD = { 'ث': 'س', 'ص': 'س', 'ذ': 'ز', 'ظ': 'ز', 'ض': 'د', 'ط': 'ت',
    'ق': 'ا', 'ك': 'ا', 'ع': 'ا', 'ء': 'ا', 'ح': 'ه', 'غ': 'خ' };

  /** A rough "sounds like" key, used only to accept the next expected word. */
  function looseKey(w) {
    if (AR_TEST.test(w)) {
      let k = stripArPrefix(w).replace(/./g, c => AR_FOLD[c] || c);
      k = k[0] + k.slice(1).replace(/[اوي]/g, ''); // long vowels are often heard differently
      return k.replace(/(.)\1+/g, '$1');
    }
    let k = w.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's')
      .replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's')
      .replace(/^wh/, 'w').replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/gh/g, '');
    k = k[0] + k.slice(1).replace(/[aeiouyw]/g, '');
    return k.replace(/(.)\1+/g, '$1');
  }

  const HOMOPHONES = [
    ['two', 'to', 'too'], ['four', 'for', 'fore'], ['eight', 'ate'], ['one', 'won'],
    ['you', 'u', 'ewe'], ['are', 'r'], ['be', 'bee'], ['see', 'sea', 'c'], ['know', 'no'],
    ['right', 'write'], ['there', 'their', 'theyre'], ['high', 'hi'], ['by', 'buy', 'bye'],
    ['son', 'sun'], ['i', 'eye'], ['knight', 'night'], ['hear', 'here'], ['dear', 'deer'],
    ['flower', 'flour'], ['wood', 'would'], ['whole', 'hole'], ['our', 'hour'], ['new', 'knew'],
  ];
  const HOMO = new Map();
  HOMOPHONES.forEach(g => g.forEach(w => HOMO.set(w, g[0])));

  function ratioOk(a, b, loose) {
    if (a === b) return true;
    const len = Math.max(a.length, b.length);
    if (len <= 2) return loose && len === 2 && a[0] === b[0] && Math.min(a.length, b.length) === 2;
    const ratio = 1 - levenshtein(a, b) / len;
    const need = loose ? (len <= 4 ? 0.66 : 0.7) : (len <= 3 ? 0.66 : len <= 5 ? 0.75 : 0.7);
    return ratio >= need;
  }

  /**
   * Are two normalized words "the same"?
   * level 'strict': small recognizer typos only.
   * level 'loose' : also sound-alikes and children's pronunciation.
   */
  function similar(spoken, expected, level) {
    if (!spoken || !expected) return false;
    if (spoken === expected) return true;
    if (HOMO.has(spoken) && HOMO.get(spoken) === HOMO.get(expected)) return true;
    if (ratioOk(spoken, expected, false)) return true;
    const a = stripArPrefix(spoken), b = stripArPrefix(expected);
    if (ratioOk(a, b, false)) return true;
    if (level !== 'loose') return false;
    const la = looseKey(spoken), lb = looseKey(expected);
    if (la === lb) return true;
    return Math.max(la.length, lb.length) >= 3 && ratioOk(la, lb, true);
  }

  const MAX_SKIP = 2;

  /**
   * Tracker keeps the child's position in the text.
   * status[i]: 'hidden' | 'said' | 'skipped' | 'hint'
   *
   * mode 'strict' : only near-exact words count.
   *      'normal' : forgiving about pronunciation of the next word (default).
   *      'easy'   : every word the child says reveals a word, even if misheard.
   *
   * Every update re-aligns the WHOLE transcript of the current recognition
   * session from where the session started, so when the recognizer corrects
   * an earlier guess ("كل" → "قل") the correction is used. Progress never
   * goes backwards.
   */
  class Tracker {
    constructor(tokens, opts) {
      this.tokens = tokens;
      this.mode = (opts && opts.mode) || 'normal';
      this.reset();
    }
    reset() {
      this.pos = 0;
      this.status = this.tokens.map(() => 'hidden');
      this.base = 0;
    }
    get done() { return this.pos >= this.tokens.length; }

    /** Call when a new recognition session starts (transcript restarts at 0). */
    newSession() { this.base = this.pos; }

    /**
     * spoken: normalized words of the whole current recognition session.
     * Returns number of tokens advanced.
     */
    update(spoken) {
      const { pos, marks } = this._align(spoken);
      const start = this.pos;
      for (let i = this.pos; i < pos; i++) this.status[i] = marks[i] || 'said';
      if (pos > this.pos) this.pos = pos;
      return this.pos - start;
    }

    /** How far would this transcript get us? (no changes made) */
    preview(spoken) { return this._align(spoken).pos; }

    _align(spoken) {
      const t = this.tokens, marks = {};
      let p = this.base, i = 0;
      while (i < spoken.length && p < t.length) {
        // Hints given during this session: the child may or may not repeat the word.
        if (p < this.pos && this.status[p] === 'hint') {
          if (similar(spoken[i], t[p].norm, 'loose')) i++;
          marks[p] = 'hint';
          p++;
          continue;
        }
        const m = this._matchAt(spoken, i, p);
        if (m) {
          for (let k = 0; k < m.skip; k++) marks[p + k] = 'skipped';
          for (let k = 0; k < m.tokens; k++) marks[p + m.skip + k] = 'said';
          p += m.skip + m.tokens;
          i += m.used;
        } else if (this.mode === 'easy') {
          marks[p++] = 'said';
          i++;
        } else {
          i++; // a word that isn't in the text ("umm"), or misheard beyond repair
        }
      }
      return { pos: p, marks };
    }

    _matchAt(spoken, i, p) {
      const t = this.tokens, w = spoken[i];
      const level = this.mode === 'strict' ? 'strict' : 'loose';
      // The next expected word: forgiving.
      if (similar(w, t[p].norm, level)) return { skip: 0, tokens: 1, used: 1 };
      // Recognizer split one word in two, or joined two words into one.
      if (i + 1 < spoken.length && similar(w + spoken[i + 1], t[p].norm, 'strict'))
        return { skip: 0, tokens: 1, used: 2 };
      if (p + 1 < t.length && similar(w, t[p].norm + t[p + 1].norm, 'strict'))
        return { skip: 0, tokens: 2, used: 1 };
      // Jumping ahead (recognizer dropped a word): strict, and only on longer words,
      // to avoid false jumps on "a", "the", "و".
      if (w.length < 4) return null;
      for (let k = 1; k <= MAX_SKIP && p + k < t.length; k++) {
        if (t[p + k].norm.length < 3) continue;
        if (similar(w, t[p + k].norm, 'strict')) {
          // a skip is only believable if the next spoken word fits what follows
          const next = spoken[i + 1], after = t[p + k + 1];
          if (next === undefined || !after || similar(next, after.norm, level) || w.length >= 5)
            return { skip: k, tokens: 1, used: 1 };
        }
      }
      return null;
    }

    /** Reveal the next word as a hint. */
    hint() {
      if (this.done) return false;
      this.status[this.pos++] = 'hint';
      return true;
    }

    score() {
      const c = { said: 0, skipped: 0, hint: 0, hidden: 0 };
      this.status.forEach(s => c[s]++);
      return c;
    }
  }

  /**
   * PaceMeter learns how fast the child recites, from the time between words
   * they get right, and turns it into how long a pause should last before
   * the next word is shown.
   *   - Only gaps between two consecutive correct words are measured: the wait
   *     at the start, or after a hint (reading time), is not their pace.
   *   - Recognizers often deliver words in bursts (3 words after 1.2 s), so a
   *     gap is divided by the number of words it brought.
   */
  class PaceMeter {
    constructor() { this.reset(); }
    reset() { this.samples = []; this.ref = null; }
    /** Start of listening, or a hint: the next gap is not a pace sample. */
    mark() { this.ref = null; }
    progress(now, wordsAdvanced) {
      if (this.ref !== null && wordsAdvanced > 0) {
        const gap = now - this.ref;
        if (gap < 6000) {
          this.samples.push({ gap, words: wordsAdvanced });
          if (this.samples.length > 10) this.samples.shift();
        }
      }
      this.ref = now;
    }
    get words() { return this.samples.reduce((n, s) => n + s.words, 0); }
    get ready() { return this.words >= 3; }
    /** Average seconds per word over the recent window. */
    secondsPerWord() {
      if (!this.ready) return null;
      return this.samples.reduce((t, s) => t + s.gap, 0) / this.words / 1000;
    }
    /**
     * Seconds of silence before the next word is shown.
     * patience: 1 = normal; >1 waits longer, <1 is quicker.
     */
    pauseDelay(patience) {
      const spw = this.secondsPerWord();
      if (spw === null) return null;
      const base = Math.min(6, Math.max(1.2, spw * 2.5 + 0.5));
      return Math.min(12, Math.max(0.8, base * (patience || 1)));
    }
  }

  /**
   * Some browsers (notably Safari on iPhone/iPad) report each new result as the
   * whole phrase so far ("قل", "قل هو", "قل هو الله"). Drop results that are just
   * a prefix of the one after them, so words aren't counted twice.
   */
  function mergeResults(transcripts, lang) {
    const lists = transcripts.map(t => words(t, lang));
    const out = [];
    lists.forEach((w, i) => {
      const next = lists[i + 1];
      const isPrefix = next && w.length && w.length <= next.length && w.every((x, j) => x === next[j]);
      if (!isPrefix) out.push(...w);
    });
    return out;
  }

  const api = { normalize, words, tokenize, detectLang, similar, looseKey, levenshtein, Tracker, PaceMeter, mergeResults };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Matcher = api;
})(typeof window !== 'undefined' ? window : globalThis);
