/* Learn by Heart — UI, storage and speech recognition. */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isAndroid = /android/i.test(navigator.userAgent);

  // ---------- Storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
    },
  };

  const SAMPLES = [
    {
      id: 'sample-ikhlas',
      title: 'سورة الإخلاص',
      lang: 'ar',
      text: 'قُلْ هُوَ اللَّهُ أَحَدٌ\nاللَّهُ الصَّمَدُ\nلَمْ يَلِدْ وَلَمْ يُولَدْ\nوَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ',
    },
    {
      id: 'sample-twinkle',
      title: 'Twinkle, Twinkle, Little Star',
      lang: 'en',
      text: 'Twinkle, twinkle, little star,\nHow I wonder what you are!\nUp above the world so high,\nLike a diamond in the sky.\nTwinkle, twinkle, little star,\nHow I wonder what you are!',
    },
  ];

  let texts = store.get('lbh.texts', null);
  if (!texts) { texts = SAMPLES.slice(); store.set('lbh.texts', texts); }
  const saveTexts = () => store.set('lbh.texts', texts);

  const settings = Object.assign(
    { delay: 3, auto: true, blanks: 'shape', en: 'en-US', ar: 'ar-SA', heard: false, mode: 'normal' },
    store.get('lbh.settings', {}));
  if (!settings.delay) { settings.delay = 3; settings.auto = false; } // older "Never" setting
  const saveSettings = () => store.set('lbh.settings', settings);

  // ---------- Screens ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goHome));
  function goHome() { stopPractice(); renderHome(); show('home'); }

  // ---------- Home ----------
  function starsHtml(n) {
    return [1, 2, 3].map(i => `<span class="${i <= n ? '' : 'off'}">⭐</span>`).join('');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderHome() {
    $('#unsupported').hidden = !!SR;
    const list = $('#text-list');
    if (!texts.length) {
      list.innerHTML = '<li class="empty">No texts yet.<br>Tap <b>＋ Add a text</b> to start!</li>';
      return;
    }
    list.innerHTML = texts.map(t => {
      const dir = t.lang === 'ar' ? 'rtl' : 'ltr';
      const best = t.best ? `<span class="best">${'⭐'.repeat(t.best)}</span>` : '';
      return `<li class="card">
        <button class="main" data-play="${esc(t.id)}">
          <span class="title" dir="auto">${esc(t.title)}</span>
          <span class="preview" dir="${dir}">${esc(t.text.split('\n')[0])}</span>
        </button>
        ${best}
        <button class="edit" data-edit="${esc(t.id)}" aria-label="Edit">✏️</button>
      </li>`;
    }).join('');
  }

  $('#text-list').addEventListener('click', e => {
    const play = e.target.closest('[data-play]');
    const edit = e.target.closest('[data-edit]');
    if (play) startPractice(play.dataset.play);
    else if (edit) openEditor(edit.dataset.edit);
  });
  $('#btn-add').addEventListener('click', () => openEditor(null));

  // ---------- Editor ----------
  let editingId = null;
  function openEditor(id) {
    editingId = id;
    const t = texts.find(x => x.id === id);
    $('#edit-heading').textContent = t ? 'Edit text' : 'New text';
    $('#edit-title').value = t ? t.title : '';
    $('#edit-text').value = t ? t.text : '';
    $('#edit-lang').value = t ? t.lang : 'auto';
    $('#btn-delete').hidden = !t;
    syncEditorDir();
    show('edit');
    if (!t) $('#edit-title').focus();
  }
  function syncEditorDir() {
    const lang = $('#edit-lang').value === 'auto'
      ? Matcher.detectLang($('#edit-text').value) : $('#edit-lang').value;
    $('#edit-text').dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  $('#edit-text').addEventListener('input', syncEditorDir);
  $('#edit-lang').addEventListener('change', syncEditorDir);

  $('#edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#edit-title').value.trim();
    const text = $('#edit-text').value.trim();
    if (!title || !text) return;
    const langSel = $('#edit-lang').value;
    const lang = langSel === 'auto' ? Matcher.detectLang(text) : langSel;
    const existing = texts.find(x => x.id === editingId);
    if (existing) {
      if (existing.text !== text) delete existing.best;
      Object.assign(existing, { title, text, lang });
    } else {
      texts.unshift({ id: 't' + Date.now().toString(36), title, text, lang });
    }
    saveTexts();
    goHome();
  });
  $('#btn-delete').addEventListener('click', () => {
    if (!confirm('Delete this text?')) return;
    texts = texts.filter(x => x.id !== editingId);
    saveTexts();
    goHome();
  });

  // ---------- Settings ----------
  const setFields = { blanks: '#set-blanks', en: '#set-en', ar: '#set-ar', mode: '#set-mode' };
  $('#btn-settings').addEventListener('click', () => {
    for (const [k, sel] of Object.entries(setFields)) $(sel).value = String(settings[k]);
    $('#set-heard').checked = settings.heard;
    $('#set-auto').checked = settings.auto;
    $('#settings').showModal();
  });
  $('#settings').addEventListener('close', () => {
    settings.auto = $('#set-auto').checked;
    settings.blanks = $('#set-blanks').value;
    settings.en = $('#set-en').value;
    settings.ar = $('#set-ar').value;
    settings.heard = $('#set-heard').checked;
    settings.mode = $('#set-mode').value;
    saveSettings();
  });

  // ---------- Practice ----------
  const P = {
    text: null, tokens: [], tracker: null, spans: [],
    listening: false, rec: null, timer: null,
    lastProgress: 0, lastActivity: 0, lastSpokenLen: 0,
    wakeLock: null, restartFails: 0,
  };
  const wordsEl = $('#words');
  const practiceEl = $('#practice');

  function startPractice(id) {
    const t = texts.find(x => x.id === id);
    if (!t) return;
    P.text = t;
    P.tokens = Matcher.tokenize(t.text, t.lang);
    P.tracker = new Matcher.Tracker(P.tokens, { mode: settings.mode });
    P.finished = false;
    $('#practice-title').textContent = t.title;
    $('#practice-title').dir = 'auto';
    wordsEl.dir = t.lang === 'ar' ? 'rtl' : 'ltr';
    wordsEl.lang = t.lang;
    buildWords();
    syncSpeed();
    show('practice');
    setHeard('');
  }

  function buildWords() {
    wordsEl.className = 'words blanks-' + settings.blanks;
    wordsEl.innerHTML = '';
    P.spans = P.tokens.map((tok, i) => {
      for (let b = 0; b < tok.br; b++) wordsEl.appendChild(document.createElement('br'));
      const s = document.createElement('span');
      s.className = 'w hidden';
      s.textContent = tok.display;
      s.dataset.i = i;
      wordsEl.appendChild(s);
      wordsEl.appendChild(document.createTextNode(' '));
      return s;
    });
    refresh(true);
  }

  function refresh(all) {
    const tr = P.tracker;
    P.spans.forEach((s, i) => {
      const cls = 'w ' + tr.status[i] + (i === tr.pos ? ' current' : '');
      if (all || s.className !== cls) s.className = cls;
    });
    const pct = P.tokens.length ? (tr.pos / P.tokens.length) * 100 : 0;
    $('#progress-bar').style.width = pct + '%';
    const cur = P.spans[Math.min(tr.pos, P.spans.length - 1)];
    if (cur && !all) {
      const box = wordsEl.getBoundingClientRect(), r = cur.getBoundingClientRect();
      if (r.top < box.top + 20 || r.bottom > box.bottom - 20) {
        wordsEl.scrollTop += r.top - box.top - box.height / 3;
      }
    }
    if (tr.done) finish();
  }

  function setHeard(text) {
    $('#heard').textContent = settings.heard && text ? '👂 ' + text : '';
  }

  // --- speech recognition ---
  function toggleMic() {
    if (P.listening) stopListening();
    else startListening();
  }

  function startListening() {
    if (!SR) { alert('Speech recognition is not supported in this browser. Please use Chrome, Edge or Safari.'); return; }
    if (P.tracker.done) restart();
    P.listening = true;
    P.restartFails = 0;
    P.lastProgress = P.lastActivity = Date.now();
    practiceEl.classList.add('listening');
    $('#mic-label').textContent = 'Listening…';
    $('#btn-mic').setAttribute('aria-label', 'Stop listening');
    requestWakeLock();
    openRecognizer();
    clearInterval(P.timer);
    P.timer = setInterval(checkPause, 200);
  }

  function openRecognizer() {
    const rec = new SR();
    rec.lang = P.text.lang === 'ar' ? settings.ar : settings.en;
    // Android Chrome repeats words in continuous mode; short sessions work better there.
    rec.continuous = !isAndroid;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    P.tracker.newSession();
    P.lastSpokenLen = 0;

    rec.onresult = e => {
      const lang = P.text.lang;
      const res = e.results, last = res.length - 1;
      const earlier = [];
      for (let i = 0; i < last; i++) earlier.push(res[i][0].transcript);
      // The recognizer may offer several guesses for the latest phrase:
      // use the one that fits the text best.
      let spoken = null, bestPos = -1, raw = '';
      for (let a = 0; a < res[last].length; a++) {
        const alt = res[last][a].transcript;
        const w = Matcher.mergeResults(earlier.concat(alt), lang);
        const pos = P.tracker.preview(w);
        if (pos > bestPos) { bestPos = pos; spoken = w; raw = alt; }
      }
      if (!spoken) return;
      setHeard(earlier.concat(raw).join(' ').trim().split(/\s+/).slice(-12).join(' '));
      if (spoken.length !== P.lastSpokenLen) {
        P.lastActivity = Date.now();
        P.lastSpokenLen = spoken.length;
      }
      P.restartFails = 0;
      if (P.tracker.update(spoken) > 0) {
        P.lastProgress = Date.now();
        refresh();
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopListening();
        alert('Please allow the microphone so I can hear you. 🎤\n(Check the browser\'s site settings.)');
      } else if (e.error === 'language-not-supported') {
        stopListening();
        alert('This browser cannot listen in ' + rec.lang + '. Try another dialect in ⚙️ Settings.');
      } else if (e.error === 'network') {
        P.restartFails++;
      }
      // 'no-speech' and 'aborted' are normal — onend restarts.
    };
    rec.onend = () => {
      if (P.rec !== rec) return;
      if (!P.listening) return;
      if (P.restartFails > 5) {
        stopListening();
        alert('Listening stopped — speech recognition needs an internet connection.');
        return;
      }
      setTimeout(() => { if (P.listening && P.rec === rec) openRecognizer(); }, isAndroid ? 50 : 150);
    };
    P.rec = rec;
    try { rec.start(); } catch { P.restartFails++; }
  }

  function stopListening() {
    P.listening = false;
    clearInterval(P.timer);
    practiceEl.classList.remove('listening');
    $('#mic-label').textContent = 'Tap & recite';
    $('#btn-mic').setAttribute('aria-label', 'Start listening');
    const rec = P.rec;
    P.rec = null;
    if (rec) { try { rec.abort(); } catch { /* already stopped */ } }
    releaseWakeLock();
  }

  function checkPause() {
    if (!P.listening || !settings.auto || P.tracker.done) return;
    const now = Date.now(), ms = settings.delay * 1000;
    const silent = now - P.lastActivity > ms;
    const stuck = now - P.lastProgress > ms * 2.5; // talking, but not the right words
    if (now - P.lastProgress > ms && (silent || stuck)) giveHint();
  }

  function giveHint() {
    if (!P.tracker || !P.tracker.hint()) return;
    P.lastProgress = P.lastActivity = Date.now();
    refresh();
  }

  function restart() {
    $('#result').open && $('#result').close();
    P.tracker.reset();
    P.finished = false;
    refresh(true);
    wordsEl.scrollTop = 0;
    setHeard('');
  }

  function stopPractice() {
    stopListening();
    stopPeek();
  }

  // --- speed slider: 🐢 waits longer before a hint, 🐇 hints quickly ---
  const slider = $('#speed-slider');
  const SMIN = +slider.min, SMAX = +slider.max;
  function syncSpeed() {
    $('#speed').hidden = !settings.auto;
    slider.value = SMIN + SMAX - settings.delay;
    const d = settings.delay;
    $('#speed-label').textContent = 'Next word after ' + (Number.isInteger(d) ? d : d.toFixed(1)) + ' s';
  }
  slider.addEventListener('input', () => {
    settings.delay = SMIN + SMAX - +slider.value;
    P.lastProgress = P.lastActivity = Date.now(); // don't fire a hint the moment it's moved
    syncSpeed();
  });
  slider.addEventListener('change', saveSettings);

  // --- peek (hold to see the whole text) ---
  let peekTimer = null;
  function startPeek() { clearTimeout(peekTimer); wordsEl.classList.add('peeking'); }
  function stopPeek() { clearTimeout(peekTimer); wordsEl.classList.remove('peeking'); }
  const peekBtn = $('#btn-peek');
  let peekDown = 0;
  peekBtn.addEventListener('pointerdown', e => { e.preventDefault(); peekDown = Date.now(); startPeek(); });
  const peekUp = () => {
    if (!peekDown) return;
    // quick tap: show for 2 seconds; long press: hide on release
    if (Date.now() - peekDown < 300) peekTimer = setTimeout(stopPeek, 2000);
    else stopPeek();
    peekDown = 0;
  };
  peekBtn.addEventListener('pointerup', peekUp);
  peekBtn.addEventListener('pointerleave', peekUp);
  peekBtn.addEventListener('pointercancel', peekUp);
  peekBtn.addEventListener('contextmenu', e => e.preventDefault());

  $('#btn-mic').addEventListener('click', toggleMic);
  $('#btn-hint').addEventListener('click', giveHint);
  $('#btn-restart').addEventListener('click', () => { stopListening(); restart(); });
  wordsEl.addEventListener('click', e => {
    const s = e.target.closest('.w');
    if (s && +s.dataset.i === P.tracker.pos) giveHint();
  });

  // --- finish ---
  function finish() {
    if (P.finished) return;
    P.finished = true;
    stopListening();
    const c = P.tracker.score();
    const n = P.tokens.length;
    const own = c.said + c.skipped;
    const ratio = n ? own / n : 0;
    const stars = ratio >= 0.95 ? 3 : ratio >= 0.75 ? 2 : 1;
    P.text.best = Math.max(P.text.best || 0, stars);
    saveTexts();
    $('#result-stars').innerHTML = starsHtml(stars);
    $('#result-title').textContent = ['', 'Good try! 💪', 'Great job! 🎉', 'Amazing! 🏆'][stars];
    $('#result-detail').textContent = c.hint
      ? `You said ${own} of ${n} words by heart, with ${c.hint} hint${c.hint > 1 ? 's' : ''}.`
      : `You said all ${n} words by heart — no hints!`;
    setTimeout(() => {
      $('#result').showModal();
      if (stars >= 2) confetti();
    }, 500);
  }
  $('#btn-result-home').addEventListener('click', () => { $('#result').close(); goHome(); });
  $('#btn-result-again').addEventListener('click', () => { restart(); startListening(); });

  // --- keep the screen awake while reciting ---
  async function requestWakeLock() {
    try { P.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
  }
  function releaseWakeLock() {
    try { P.wakeLock?.release(); } catch { /* ignore */ }
    P.wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && P.listening) stopListening();
  });

  // --- confetti ---
  function confetti() {
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#ff8a3d', '#ffc94d', '#6c5ce7', '#1f8a5b', '#ff5d8f', '#4dc3ff'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t - t0 < 3500) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }

  renderHome();
})();
