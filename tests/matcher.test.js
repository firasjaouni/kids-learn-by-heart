const assert = require('assert');
const M = require('../matcher.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };

test('normalizes arabic diacritics and letter forms', () => {
  assert.strictEqual(M.normalize('بِسْمِ', 'ar'), 'بسم');
  assert.strictEqual(M.normalize('الرَّحْمَٰنِ', 'ar'), 'الرحمن');
  assert.strictEqual(M.normalize('إِيَّاكَ', 'ar'), 'اياك');
  assert.strictEqual(M.normalize('الْحَمْدُ', 'ar'), M.normalize('الحمد', 'ar'));
  assert.strictEqual(M.normalize('رحمة', 'ar'), M.normalize('رحمه', 'ar'));
});

test('normalizes english punctuation, case, numbers', () => {
  assert.strictEqual(M.normalize('Star,', 'en'), 'star');
  assert.strictEqual(M.normalize("Don't", 'en'), 'dont');
  assert.strictEqual(M.normalize('3', 'en'), 'three');
});

test('detects language', () => {
  assert.strictEqual(M.detectLang('بسم الله الرحمن الرحيم'), 'ar');
  assert.strictEqual(M.detectLang('Twinkle twinkle little star'), 'en');
});

test('tokenize keeps line breaks and glues punctuation', () => {
  const t = M.tokenize('Hello world —\nnext line', 'en');
  assert.deepStrictEqual(t.map(x => x.norm), ['hello', 'world', 'next', 'line']);
  assert.strictEqual(t[1].display, 'world —');
  assert.strictEqual(t[2].br, 1);
});

const run = (text, lang, chunks, mode) => {
  const tr = new M.Tracker(M.tokenize(text, lang), { mode });
  for (const [said, final] of chunks) {
    const w = M.words(said, lang);
    tr.update(w);
  }
  return tr;
};

test('tracks english speech progressively with interim results', () => {
  const tr = run('Twinkle, twinkle, little star, how I wonder what you are!', 'en', [
    ['twinkle', false], ['twinkle twinkle', false], ['twinkle twinkle little', false],
    ['twinkle twinkle little star how I wonder', true],
  ]);
  assert.strictEqual(tr.pos, 7);
  assert.ok(tr.status.slice(0, 7).every(s => s === 'said'));
});

test('half-heard interim word is re-checked', () => {
  const tr = run('a beautiful day', 'en', [['a beauti', false], ['a beautiful day', false]]);
  assert.strictEqual(tr.pos, 3);
});

test('tolerates recognizer misspellings', () => {
  const tr = run('the caterpillar was hungry', 'en', [['the catapiller was hungry', true]]);
  assert.strictEqual(tr.pos, 4);
});

test('ignores wrong words and does not jump on short words', () => {
  const tr = run('one fish two fish red fish blue fish', 'en', [['one um uh fish', true]]);
  assert.strictEqual(tr.pos, 2);
  assert.strictEqual(tr.status[1], 'said');
});

test('skips a word the recognizer dropped', () => {
  const tr = run('the quick brown elephant jumped', 'en', [['the quick elephant jumped', true]]);
  assert.strictEqual(tr.pos, 5);
  assert.strictEqual(tr.status[2], 'skipped');
});

test('arabic fatiha without diacritics in transcript', () => {
  const text = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
  const tr = run(text, 'ar', [['بسم الله الرحمن الرحيم الحمد لله رب العالمين', true]]);
  assert.strictEqual(tr.pos, 8);
});

test('arabic conjunction split by recognizer', () => {
  const tr = run('وَلَا الضَّالِّينَ', 'ar', [['و لا الضالين', true]]);
  assert.strictEqual(tr.pos, 2);
});

test('hint advances and new session restarts consumption', () => {
  const tr = run('red green blue', 'en', [['red', true]]);
  tr.hint();
  assert.strictEqual(tr.status[1], 'hint');
  tr.newSession();
  tr.update(['green', 'blue']);
  assert.strictEqual(tr.pos, 3);
  assert.deepStrictEqual(tr.score(), { said: 2, skipped: 0, hint: 1, hidden: 0 });
});

const IKHLAS = 'قُلْ هُوَ اللَّهُ أَحَدٌ\nاللَّهُ الصَّمَدُ\nلَمْ يَلِدْ وَلَمْ يُولَدْ\nوَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ';

test('recognizer correcting an earlier guess is used', () => {
  const tr = run(IKHLAS, 'ar', [['كل', false], ['كل هو', false], ['قل هو الله احد', false]]);
  assert.strictEqual(tr.pos, 4);
});

test("children's / dialect pronunciation of the next word", () => {
  const tr = run(IKHLAS, 'ar', [['ءل هو الله اهد الله السمد لم يلد ولم يولد ولم يكون له كفؤا احد', true]]);
  assert.strictEqual(tr.pos, 15);
});

test('english homophones and sound-alikes', () => {
  const tr = run('I have two hands and four fingers', 'en', [['eye have to hands and for fingers', true]]);
  assert.strictEqual(tr.pos, 7);
  const tr2 = run('Twinkle twinkle little star', 'en', [['twinkel twinkel littel stah', true]]);
  assert.strictEqual(tr2.pos, 4);
});

test('reciting a different text does not advance (few false positives)', () => {
  const fatiha = 'الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين اياك نعبد واياك نستعين';
  const tr = run(IKHLAS, 'ar', [[fatiha, true]]);
  assert.ok(tr.pos <= 1, 'advanced ' + tr.pos);
  const tr2 = run('Twinkle twinkle little star how I wonder what you are', 'en',
    [['the quick brown fox jumps over the lazy dog every single day', true]]);
  assert.ok(tr2.pos <= 1, 'advanced ' + tr2.pos);
});

test('hint during a session: child repeating the hinted word is fine', () => {
  const tr = new M.Tracker(M.tokenize('red green blue yellow', 'en'));
  tr.update(['red']);
  tr.hint();                                  // green shown
  tr.update(['red', 'green', 'blue']);        // child repeats green, then blue
  assert.strictEqual(tr.pos, 3);
  assert.deepStrictEqual(tr.status, ['said', 'hint', 'said', 'hidden']);
});

test('easy mode reveals a word for every word spoken', () => {
  const tr = run('one fish two fish', 'en', [['wun fizz blah fish', true]], 'easy');
  assert.strictEqual(tr.pos, 4);
});

test('strict mode does not accept sound-alikes', () => {
  const tr = run(IKHLAS, 'ar', [['ءل', true]], 'strict');
  assert.strictEqual(tr.pos, 0);
});

test('safari-style cumulative results are not double counted', () => {
  const w = M.mergeResults(['قل', 'قل هو', 'قل هو الله'], 'ar');
  assert.deepStrictEqual(w, ['قل', 'هو', 'الله']);
  const w2 = M.mergeResults(['twinkle twinkle', 'little star'], 'en');
  assert.deepStrictEqual(w2, ['twinkle', 'twinkle', 'little', 'star']);
});

console.log(`\n${n} tests passed`);
