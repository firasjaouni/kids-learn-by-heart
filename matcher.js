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
    return w.length > 3 && (w[0] === '\u0648' || w[0] === '\u0641') ? w.slice(1) : w;
  }

  /** Are two normalized words "the same" (tolerant to recognizer errors)? */
  function similar(spoken, expected) {
    if (!spoken || !expected) return false;
    if (spoken === expected) return true;
    const pairs = [[spoken, expected], [stripArPrefix(spoken), stripArPrefix(expected)]];
    for (const [a, b] of pairs) {
      if (a === b) return true;
      const len = Math.max(a.length, b.length);
      if (len <= 2) continue;
      const ratio = 1 - levenshtein(a, b) / len;
      const need = len <= 3 ? 0.66 : len <= 5 ? 0.75 : 0.7;
      if (ratio >= need) return true;
    }
    return false;
  }

  const MAX_SKIP = 2;

  /**
   * Tracker keeps the child's position in the text.
   * status[i]: 'hidden' | 'said' | 'skipped' | 'hint'
   */
  class Tracker {
    constructor(tokens) {
      this.tokens = tokens;
      this.reset();
    }
    reset() {
      this.pos = 0;
      this.status = this.tokens.map(() => 'hidden');
      this.consumed = 0;
    }
    get done() { return this.pos >= this.tokens.length; }

    /** Call when a new recognition session starts (transcript restarts at 0). */
    newSession() { this.consumed = 0; }

    /**
     * spoken: normalized words of the whole current recognition session.
     * finalCount: how many leading words are final (won't be revised).
     * Returns number of tokens advanced.
     */
    update(spoken, finalCount) {
      if (spoken.length < this.consumed) this.consumed = spoken.length;
      const start = this.pos;
      let i = this.consumed;
      while (i < spoken.length && !this.done) {
        const m = this._matchAt(spoken, i);
        if (m) {
          for (let k = 0; k < m.skip; k++) this.status[this.pos + k] = 'skipped';
          for (let k = 0; k < m.tokens; k++) this.status[this.pos + m.skip + k] = 'said';
          this.pos += m.skip + m.tokens;
          i += m.used;
          this.consumed = i;
        } else {
          // An unmatched word that is still interim and last may be a half-heard
          // word ("beauti…") — keep it to re-check on the next update.
          const revisable = i >= finalCount && i === spoken.length - 1;
          i++;
          if (!revisable) this.consumed = i;
        }
      }
      return this.pos - start;
    }

    _matchAt(spoken, i) {
      const t = this.tokens, p = this.pos, w = spoken[i];
      for (let k = 0; k <= MAX_SKIP && p + k < t.length; k++) {
        // only skip ahead on longer words, to avoid false jumps on "a", "the", "و"
        if (k > 0 && (w.length < 4 || t[p + k].norm.length < 3)) break;
        if (similar(w, t[p + k].norm)) return { skip: k, tokens: 1, used: 1 };
        if (k === 0) {
          if (i + 1 < spoken.length && similar(w + spoken[i + 1], t[p].norm))
            return { skip: 0, tokens: 1, used: 2 };
          if (p + 1 < t.length && similar(w, t[p].norm + t[p + 1].norm))
            return { skip: 0, tokens: 2, used: 1 };
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

  const api = { normalize, words, tokenize, detectLang, similar, levenshtein, Tracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Matcher = api;
})(typeof window !== 'undefined' ? window : globalThis);
