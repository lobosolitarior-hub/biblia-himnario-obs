/**
 * ============================================================================
 *  PANEL DE CONTROL: Biblia e Himnario Adventista para OBS Studio
 *  AUTOR:            Ing. Rubén Humberto Armendáriz Tamayo
 *  TÍTULO:           Ingeniero en Sistemas Computacionales
 * ============================================================================
 */
(() => {
  const socket = io();

  // =========================================================
  // 1. ELEMENTOS DEL DOM - HIMNARIO
  // =========================================================
  const hymnNumberInput = document.getElementById('hymnNumberInput');
  const hymnSearchInput = document.getElementById('hymnSearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const autocompleteList = document.getElementById('autocompleteList');

  const badgeCantado = document.getElementById('badgeCantado');
  const badgeInstrumental = document.getElementById('badgeInstrumental');

  const audioModeButtons = document.querySelectorAll('#audioModeGroup .mini-pill-btn');
  const advanceModeButtons = document.querySelectorAll('#advanceModeGroup .mini-pill-btn');

  const btnProject = document.getElementById('btnProject');
  const btnStop = document.getElementById('btnStop');
  const btnPrevSlide = document.getElementById('btnPrevSlide');
  const btnNextSlide = document.getElementById('btnNextSlide');

  // =========================================================
  // 2. ELEMENTOS DEL DOM - BIBLIA
  // =========================================================
  const bibleChapterLabel = document.getElementById('bibleChapterLabel');
  const bibleSearchInput = document.getElementById('bibleSearchInput');
  const btnClearBible = document.getElementById('btnClearBible');
  const bibleAutocompleteList = document.getElementById('bibleAutocompleteList');
  const btnBibleProject = document.getElementById('btnBibleProject');
  const btnBibleStop = document.getElementById('btnBibleStop');
  const bibleVersionButtons = document.querySelectorAll('#bibleVersionGroup .mini-pill-btn');
  const bibleSceneButtons = document.querySelectorAll('#bibleSceneGroup .mini-pill-btn');
  const btnPrevVerse = document.getElementById('btnPrevVerse');
  const btnNextVerse = document.getElementById('btnNextVerse');
  const bibleVersesList = document.getElementById('bibleVersesList');

  // =========================================================
  // 3. ELEMENTOS DEL DOM - CONFIGURACIÓN OBS
  // =========================================================
  const btnObsConfig = document.getElementById('btnObsConfig');
  const obsStatusDot = document.getElementById('obsStatusDot');
  const obsModal = document.getElementById('obsModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const obsConfigForm = document.getElementById('obsConfigForm');
  const obsUrlInput = document.getElementById('obsUrlInput');
  const obsPassInput = document.getElementById('obsPassInput');
  const obsSceneInput = document.getElementById('obsSceneInput');
  const obsBibleBgInput = document.getElementById('obsBibleBgInput');
  const obsBibleCamInput = document.getElementById('obsBibleCamInput');
  const obsAudioRootInput = document.getElementById('obsAudioRootInput');
  const btnOpenAudioFolder = document.getElementById('btnOpenAudioFolder');

  // Estado local de Himnario
  let allHymns = [];
  let selectedHymn = null;
  let audioMode = 'cantado'; // 'cantado' | 'instrumental' | 'letra'
  let advanceMode = 'auto'; // 'auto' | 'manual'
  let liveState = null;
  let activeDropdownIndex = -1;
  let currentMatches = [];

  // Estado local de Biblia
  let bibleBooks = [];
  let bibleVersion = 'RVR1960'; // 'RVR1960' | 'DHH'
  let bibleSceneMode = 'fondo'; // 'fondo' | 'camara'
  let currentChapterData = null; // { version, bookId, bookName, chapter, totalChapters, verses: [] }
  let selectedBibleVerse = 1;
  let liveBibleState = null;
  let bibleDropdownMatches = [];
  let bibleDropdownIndex = -1;

  // Normalizar texto para búsqueda sin tildes ni signos
  function normalize(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¡!¿?,.;:()"']/g, '')
      .toLowerCase()
      .trim();
  }

  // =========================================================
  // LÓGICA DEL HIMNARIO
  // =========================================================
  async function fetchHymnsIndex() {
    try {
      const res = await fetch('/api/himnos');
      allHymns = await res.json();
      if (!selectedHymn && allHymns.length > 0) {
        await selectHymnByNumber(1, { updateInputs: true });
      }
    } catch (err) {
      console.error('Error cargando lista de himnos:', err);
    }
  }

  async function selectHymnByNumber(number, options = { updateInputs: true }) {
    const num = Number(number);
    if (!num || num < 1 || num > 614) return null;

    try {
      const res = await fetch(`/api/himnos/${num}`);
      if (!res.ok) return null;
      const hymn = await res.json();
      selectedHymn = hymn;

      if (options.updateInputs) {
        hymnNumberInput.value = hymn.number;
        hymnSearchInput.value = hymn.title;
        btnClearSearch.hidden = false;
      }

      updateAudioBadges(hymn);
      updatePlaybackButtons();
      hideAutocomplete();
      return hymn;
    } catch (err) {
      console.error('Error cargando himno:', err);
      return null;
    }
  }

  function isCurrentSelectionActive() {
    return Boolean(
      liveState &&
        liveState.active &&
        liveState.hymn &&
        selectedHymn &&
        Number(liveState.hymn.number) === Number(selectedHymn.number) &&
        liveState.audioMode === audioMode
    );
  }

  function updatePlaybackButtons() {
    const isAnyActive = Boolean(liveState && liveState.active && liveState.hymn);
    const isSameSelection = isCurrentSelectionActive();

    if (isSameSelection && liveState.isPlaying) {
      btnProject.textContent = '⏸';
      btnProject.classList.add('paused-mode');
      btnProject.title = 'Pausar himno';
      btnProject.dataset.tooltip = 'Pausar himno';
    } else if (isSameSelection && !liveState.isPlaying) {
      btnProject.textContent = '▶';
      btnProject.classList.remove('paused-mode');
      btnProject.title = 'Reanudar himno';
      btnProject.dataset.tooltip = 'Reanudar himno';
    } else {
      btnProject.textContent = '▶';
      btnProject.classList.remove('paused-mode');
      btnProject.title = 'Proyectar himno';
      btnProject.dataset.tooltip = 'Proyectar himno';
    }

    if (btnStop) {
      btnStop.disabled = !isAnyActive;
    }
  }

  function updateAudioBadges(hymn) {
    if (!hymn) return;
    const info = hymn.audioInfo || {};

    const cantadoLabel = info.hasLocalCantado ? 'Cantado (Local)' : 'Cantado (Internet)';
    badgeCantado.className = `audio-pill ${info.hasLocalCantado ? 'local' : 'internet'}`;
    badgeCantado.title = cantadoLabel;
    badgeCantado.dataset.tooltip = cantadoLabel;

    const instrLabel = info.hasLocalInstrumental
      ? 'Instrumental (Local)'
      : 'Instrumental (Internet)';
    badgeInstrumental.className = `audio-pill ${
      info.hasLocalInstrumental ? 'local' : 'internet'
    }`;
    badgeInstrumental.title = instrLabel;
    badgeInstrumental.dataset.tooltip = instrLabel;
  }

  function updateManualNavState() {
    const isManual = advanceMode === 'manual';
    if (!isManual) {
      btnPrevSlide.disabled = true;
      btnNextSlide.disabled = true;
      return;
    }

    const isActive = Boolean(liveState && liveState.active && liveState.hymn);
    if (isActive) {
      btnPrevSlide.disabled = liveState.currentSlideIndex <= 0;
      btnNextSlide.disabled =
        liveState.currentSlideIndex >= liveState.hymn.slides.length - 1;
    } else {
      btnPrevSlide.disabled = false;
      btnNextSlide.disabled = false;
    }
  }

  function showAutocomplete(query) {
    const q = normalize(query);
    if (!q) {
      currentMatches = allHymns.slice(0, 15);
    } else {
      currentMatches = allHymns
        .filter((h) => {
          const numStr = String(h.number);
          const padStr = numStr.padStart(3, '0');
          const normTitle = normalize(h.title);
          return (
            numStr.startsWith(q) ||
            padStr.startsWith(q) ||
            normTitle.includes(q)
          );
        })
        .slice(0, 25);
    }

    activeDropdownIndex = -1;
    autocompleteList.innerHTML = '';

    if (currentMatches.length === 0) {
      const li = document.createElement('li');
      li.className = 'autocomplete-empty';
      li.textContent = 'Sin coincidencias';
      autocompleteList.appendChild(li);
      autocompleteList.hidden = false;
      return;
    }

    currentMatches.forEach((h, i) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.dataset.index = i;
      li.innerHTML = `
        <span class="ac-num">#${String(h.number).padStart(3, '0')}</span>
        <span class="ac-title">${h.title}</span>
      `;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectHymnByNumber(h.number, { updateInputs: true });
      });
      autocompleteList.appendChild(li);
    });

    autocompleteList.hidden = false;
  }

  function hideAutocomplete() {
    autocompleteList.hidden = true;
    activeDropdownIndex = -1;
  }

  function highlightDropdownItem(index) {
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    items.forEach((el, i) => {
      el.classList.toggle('highlighted', i === index);
      if (i === index) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  hymnNumberInput.addEventListener('input', async () => {
    const val = hymnNumberInput.value.trim();
    if (!val) {
      hymnSearchInput.value = '';
      btnClearSearch.hidden = true;
      return;
    }
    const num = Number(val);
    if (num >= 1 && num <= 614) {
      const match = allHymns.find((h) => h.number === num);
      if (match) {
        hymnSearchInput.value = match.title;
        btnClearSearch.hidden = false;
      }
      await selectHymnByNumber(num, { updateInputs: false });
    }
  });

  hymnNumberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedHymn) {
        startProjection(0);
      }
    }
  });

  hymnSearchInput.addEventListener('focus', () => {
    hymnSearchInput.select();
    showAutocomplete(hymnSearchInput.value);
  });

  hymnSearchInput.addEventListener('input', async () => {
    const raw = hymnSearchInput.value;
    btnClearSearch.hidden = !raw;
    showAutocomplete(raw);

    const trimmed = raw.trim();
    if (/^\d{1,3}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num >= 1 && num <= 614) {
        hymnNumberInput.value = num;
        await selectHymnByNumber(num, { updateInputs: false });
      }
    }
  });

  hymnSearchInput.addEventListener('keydown', (e) => {
    if (autocompleteList.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentMatches.length > 0) {
        activeDropdownIndex = (activeDropdownIndex + 1) % currentMatches.length;
        highlightDropdownItem(activeDropdownIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentMatches.length > 0) {
        activeDropdownIndex =
          (activeDropdownIndex - 1 + currentMatches.length) % currentMatches.length;
        highlightDropdownItem(activeDropdownIndex);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeDropdownIndex >= 0 && currentMatches[activeDropdownIndex]) {
        selectHymnByNumber(currentMatches[activeDropdownIndex].number, {
          updateInputs: true,
        });
      } else if (currentMatches.length > 0) {
        selectHymnByNumber(currentMatches[0].number, { updateInputs: true });
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  hymnSearchInput.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 180);
  });

  btnClearSearch.addEventListener('click', () => {
    hymnSearchInput.value = '';
    hymnNumberInput.value = '';
    btnClearSearch.hidden = true;
    hymnSearchInput.focus();
    showAutocomplete('');
  });

  audioModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      audioMode = btn.dataset.mode;
      audioModeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      updatePlaybackButtons();
    });
  });

  advanceModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      advanceMode = btn.dataset.advance;
      advanceModeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      updateManualNavState();
      socket.emit('project:advance-mode', { advanceMode });
    });
  });

  function startProjection(startSlideIndex = 0) {
    if (!selectedHymn) return;
    socket.emit('project:start', {
      number: selectedHymn.number,
      audioMode,
      advanceMode,
      startSlideIndex,
    });
  }

  btnProject.addEventListener('click', () => {
    if (isCurrentSelectionActive()) {
      const ended =
        !liveState.isPlaying &&
        liveState.duration > 0 &&
        liveState.currentTime >= liveState.duration - 1;
      if (ended) {
        startProjection(0);
      } else {
        socket.emit('project:toggle-play');
      }
    } else {
      startProjection(0);
    }
  });

  if (btnStop) {
    btnStop.addEventListener('click', () => {
      socket.emit('project:stop');
    });
  }

  btnPrevSlide.addEventListener('click', () => {
    if (advanceMode !== 'manual') return;
    socket.emit('project:slide', { direction: 'prev' });
  });

  btnNextSlide.addEventListener('click', () => {
    if (advanceMode !== 'manual') return;
    socket.emit('project:slide', { direction: 'next' });
  });

  // =========================================================
  // LÓGICA DE SANTA BIBLIA (RVR1960 / DHH)
  // =========================================================
  function normBook(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchBibleBooks() {
    try {
      const res = await fetch('/api/biblia/libros');
      bibleBooks = await res.json();
      await loadBibleChapter('GEN', 1, 1, { scroll: false });
    } catch (err) {
      console.error('Error cargando libros de la Biblia:', err);
    }
  }

  /**
   * Busca el libro que coincida con el texto escrito (ej: "gen", "exodo", "1 jn", "salmos")
   */
  function findMatchingBooks(bookQuery) {
    const q = normBook(bookQuery);
    if (!q) return bibleBooks.slice(0, 15);

    const qNoSpace = q.replace(/\s+/g, '');
    const scored = [];

    for (const b of bibleBooks) {
      const nName = normBook(b.name);
      const nNameNoSpace = nName.replace(/\s+/g, '');
      const aliases = (b.aliases || []).map((a) => normBook(a));

      if (nName === q || nNameNoSpace === qNoSpace || aliases.includes(q)) {
        scored.push({ book: b, score: 100 });
      } else if (nName.startsWith(q) || nNameNoSpace.startsWith(qNoSpace)) {
        scored.push({ book: b, score: 80 });
      } else if (aliases.some((a) => a.startsWith(q))) {
        scored.push({ book: b, score: 70 });
      } else if (nName.includes(q)) {
        scored.push({ book: b, score: 50 });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.book.number - b.book.number);
    return scored.map((s) => s.book);
  }

  /**
   * Interpreta una cadena como:
   *  - "gen" -> solo consulta de libro (sin capítulo aún)
   *  - "Génesis 3:20" -> { book, chapter: 3, verse: 20 }
   *  - "exodo 20:8-11" -> { book, chapter: 20, verse: 8 }
   *  - "Génesis 5" -> { book, chapter: 5, verse: 1 }
   */
  function parseBibleInput(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return { type: 'empty' };

    // Regex: (Nombre del libro, que puede empezar por 1, 2 o 3) + (capítulo opcional) + (: o espacio + versículo opcional)
    const m = trimmed.match(
      /^([123]?\s*[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ.]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ.]+)*?)(?:\s+(\d{1,3})(?:[:.,\s]+(\d{1,3})(?:\s*[-–]\s*\d{1,3})?)?)?\s*$/
    );

    if (!m) {
      return { type: 'book-search', bookQuery: trimmed };
    }

    const bookPart = m[1].trim();
    const chapterStr = m[2];
    const verseStr = m[3];
    const matches = findMatchingBooks(bookPart);

    if (!chapterStr) {
      return {
        type: 'book-search',
        bookQuery: bookPart,
        matches,
        topBook: matches[0] || null,
      };
    }

    const book = matches[0] || null;
    if (!book) {
      return { type: 'book-search', bookQuery: trimmed, matches: [] };
    }

    const chapter = Math.max(1, Math.min(book.chaptersCount, Number(chapterStr) || 1));
    const verse = verseStr ? Math.max(1, Number(verseStr) || 1) : 1;

    return {
      type: 'reference',
      book,
      chapter,
      verse,
      hasExplicitVerse: Boolean(verseStr),
    };
  }

  async function loadBibleChapter(bookId, chapter, targetVerse = 1, options = { scroll: true }) {
    try {
      const sameChapterLoaded =
        currentChapterData &&
        currentChapterData.version === bibleVersion &&
        currentChapterData.bookId === bookId &&
        Number(currentChapterData.chapter) === Number(chapter);

      if (!sameChapterLoaded) {
        const res = await fetch(`/api/biblia/${bibleVersion}/${bookId}/${chapter}`);
        if (!res.ok) return null;
        currentChapterData = await res.json();
      }

      const verses = currentChapterData.verses || [];
      const foundVerse =
        verses.find((v) => v.v === Number(targetVerse)) ||
        verses.find((v) => v.v >= Number(targetVerse)) ||
        verses[0];

      selectedBibleVerse = foundVerse ? foundVerse.v : 1;
      renderBibleChapterList({ scroll: options.scroll });
      return currentChapterData;
    } catch (err) {
      console.error('Error cargando capítulo bíblico:', err);
      return null;
    }
  }

  function renderBibleChapterList(options = { scroll: true }) {
    if (!currentChapterData) return;

    const verLabel = currentChapterData.version === 'DHH' ? 'DHH' : 'RVR60';
    bibleChapterLabel.textContent = `${currentChapterData.bookName} ${currentChapterData.chapter}:${selectedBibleVerse} (${verLabel})`;

    bibleVersesList.innerHTML = '';
    const verses = currentChapterData.verses || [];

    verses.forEach((v) => {
      const li = document.createElement('li');
      const isSelected = v.v === selectedBibleVerse;
      const isLive =
        liveBibleState &&
        liveBibleState.active &&
        liveBibleState.bookId === currentChapterData.bookId &&
        Number(liveBibleState.chapter) === Number(currentChapterData.chapter) &&
        Number(liveBibleState.verse) === v.v;

      li.className = `bible-verse-item${isSelected ? ' selected' : ''}${isLive ? ' live' : ''}`;
      li.dataset.verse = v.v;
      li.innerHTML = `
        <span class="bv-num">${v.label || v.v}</span>
        <span class="bv-text">${v.text}</span>
      `;

      // Al hacer clic en cualquier versículo de la lista: seleccionarlo y proyectarlo en directo
      li.addEventListener('click', () => {
        selectedBibleVerse = v.v;
        bibleSearchInput.value = `${currentChapterData.bookName} ${currentChapterData.chapter}:${v.v}`;
        btnClearBible.hidden = false;
        renderBibleChapterList({ scroll: false });
        projectCurrentBibleVerse();
      });

      bibleVersesList.appendChild(li);
    });

    if (options.scroll) {
      const activeEl = bibleVersesList.querySelector('.bible-verse-item.selected');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function showBibleAutocomplete(books) {
    bibleDropdownMatches = books.slice(0, 20);
    bibleDropdownIndex = -1;
    bibleAutocompleteList.innerHTML = '';

    if (bibleDropdownMatches.length === 0) {
      bibleAutocompleteList.hidden = true;
      return;
    }

    bibleDropdownMatches.forEach((b, i) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.dataset.index = i;
      li.innerHTML = `
        <span class="ac-num">${b.name}</span>
        <span class="ac-title">(${b.chaptersCount} cap.)</span>
      `;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        chooseBookFromAutocomplete(b);
      });
      bibleAutocompleteList.appendChild(li);
    });

    bibleAutocompleteList.hidden = false;
  }

  function hideBibleAutocomplete() {
    bibleAutocompleteList.hidden = true;
    bibleDropdownIndex = -1;
  }

  function highlightBibleDropdown(index) {
    const items = bibleAutocompleteList.querySelectorAll('.autocomplete-item');
    items.forEach((el, i) => {
      el.classList.toggle('highlighted', i === index);
      if (i === index) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Cuando el usuario selecciona un libro del desplegable (ej: "Génesis"), se rellena "Génesis "
  // y el cursor queda listo para seguir escribiendo "3:20" o "5"
  async function chooseBookFromAutocomplete(book) {
    bibleSearchInput.value = `${book.name} `;
    btnClearBible.hidden = false;
    hideBibleAutocomplete();
    bibleSearchInput.focus();
    await loadBibleChapter(book.id, 1, 1, { scroll: true });
  }

  function projectCurrentBibleVerse() {
    if (!currentChapterData) return;
    socket.emit('bible:project', {
      version: bibleVersion,
      bookId: currentChapterData.bookId,
      chapter: currentChapterData.chapter,
      verse: selectedBibleVerse,
      sceneMode: bibleSceneMode,
    });
  }

  function updateBibleButtonsState() {
    const isBibleActive = Boolean(liveBibleState && liveBibleState.active);
    if (btnBibleStop) {
      btnBibleStop.disabled = !isBibleActive;
    }
  }

  // Eventos del buscador inteligente de Biblia
  bibleSearchInput.addEventListener('focus', () => {
    const parsed = parseBibleInput(bibleSearchInput.value);
    if (parsed.type === 'empty') {
      showBibleAutocomplete(bibleBooks);
    } else if (parsed.type === 'book-search') {
      showBibleAutocomplete(parsed.matches || []);
    }
  });

  bibleSearchInput.addEventListener('input', async () => {
    const raw = bibleSearchInput.value;
    btnClearBible.hidden = !raw;

    const parsed = parseBibleInput(raw);
    if (parsed.type === 'empty') {
      showBibleAutocomplete(bibleBooks);
      return;
    }

    if (parsed.type === 'book-search') {
      showBibleAutocomplete(parsed.matches || []);
      if (parsed.topBook) {
        await loadBibleChapter(parsed.topBook.id, 1, 1, { scroll: true });
      }
      return;
    }

    if (parsed.type === 'reference') {
      hideBibleAutocomplete();
      await loadBibleChapter(parsed.book.id, parsed.chapter, parsed.verse, {
        scroll: true,
      });
    }
  });

  bibleSearchInput.addEventListener('keydown', async (e) => {
    if (!bibleAutocompleteList.hidden && bibleDropdownMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        bibleDropdownIndex = (bibleDropdownIndex + 1) % bibleDropdownMatches.length;
        highlightBibleDropdown(bibleDropdownIndex);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        bibleDropdownIndex =
          (bibleDropdownIndex - 1 + bibleDropdownMatches.length) %
          bibleDropdownMatches.length;
        highlightBibleDropdown(bibleDropdownIndex);
        return;
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        const parsed = parseBibleInput(bibleSearchInput.value);
        if (parsed.type === 'book-search') {
          e.preventDefault();
          const chosen =
            bibleDropdownIndex >= 0
              ? bibleDropdownMatches[bibleDropdownIndex]
              : bibleDropdownMatches[0];
          if (chosen) {
            await chooseBookFromAutocomplete(chosen);
          }
          return;
        }
      } else if (e.key === 'Escape') {
        hideBibleAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      hideBibleAutocomplete();
      const parsed = parseBibleInput(bibleSearchInput.value);
      if (parsed.type === 'reference') {
        await loadBibleChapter(parsed.book.id, parsed.chapter, parsed.verse, {
          scroll: true,
        });
      }
      projectCurrentBibleVerse();
    }
  });

  bibleSearchInput.addEventListener('blur', () => {
    setTimeout(hideBibleAutocomplete, 180);
  });

  btnClearBible.addEventListener('click', () => {
    bibleSearchInput.value = '';
    btnClearBible.hidden = true;
    bibleSearchInput.focus();
    showBibleAutocomplete(bibleBooks);
  });

  btnBibleProject.addEventListener('click', async () => {
    const parsed = parseBibleInput(bibleSearchInput.value);
    if (parsed.type === 'reference') {
      await loadBibleChapter(parsed.book.id, parsed.chapter, parsed.verse, {
        scroll: true,
      });
    }
    projectCurrentBibleVerse();
  });

  btnBibleStop.addEventListener('click', () => {
    socket.emit('bible:stop');
  });

  // Selector de versión (RVR1960 / DHH)
  bibleVersionButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      bibleVersion = btn.dataset.version;
      bibleVersionButtons.forEach((b) => b.classList.toggle('active', b === btn));
      if (currentChapterData) {
        await loadBibleChapter(
          currentChapterData.bookId,
          currentChapterData.chapter,
          selectedBibleVerse,
          { scroll: false }
        );
        if (liveBibleState && liveBibleState.active) {
          projectCurrentBibleVerse();
        }
      }
    });
  });

  // Selector de Escena OBS para Biblia (Fondo vs Cámara)
  bibleSceneButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      bibleSceneMode = btn.dataset.scene;
      bibleSceneButtons.forEach((b) => b.classList.toggle('active', b === btn));
      socket.emit('bible:scene-mode', { sceneMode: bibleSceneMode });
    });
  });

  // Avanzar / Retroceder versículo con botones < >
  function stepBibleVerse(delta) {
    if (!currentChapterData || !Array.isArray(currentChapterData.verses)) return;
    const verses = currentChapterData.verses;
    const idx = verses.findIndex((v) => v.v === selectedBibleVerse);
    const nextIdx = Math.max(0, Math.min(verses.length - 1, (idx >= 0 ? idx : 0) + delta));
    const target = verses[nextIdx];
    if (!target) return;

    selectedBibleVerse = target.v;
    bibleSearchInput.value = `${currentChapterData.bookName} ${currentChapterData.chapter}:${target.v}`;
    btnClearBible.hidden = false;
    renderBibleChapterList({ scroll: true });

    if (liveBibleState && liveBibleState.active) {
      projectCurrentBibleVerse();
    }
  }

  btnPrevVerse.addEventListener('click', () => stepBibleVerse(-1));
  btnNextVerse.addEventListener('click', () => stepBibleVerse(1));

  // =========================================================
  // CONFIGURACIÓN OBS WEBSOCKET
  // =========================================================
  if (btnObsConfig && obsModal) {
    btnObsConfig.addEventListener('click', () => {
      obsModal.hidden = !obsModal.hidden;
    });
  }

  if (btnCloseModal && obsModal) {
    btnCloseModal.addEventListener('click', () => {
      obsModal.hidden = true;
    });
  }

  if (btnOpenAudioFolder) {
    btnOpenAudioFolder.addEventListener('click', async () => {
      try {
        await fetch('/api/audio/open-folder', { method: 'POST' });
      } catch (err) {
        console.error('Error abriendo carpeta de audios:', err);
      }
    });
  }

  if (obsConfigForm) {
    obsConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/obs/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: obsUrlInput.value.trim(),
            password: obsPassInput.value,
            sceneName: obsSceneInput.value.trim() || 'Himnario',
            bibleBgSceneName: obsBibleBgInput ? obsBibleBgInput.value.trim() || 'Biblia' : 'Biblia',
            bibleCamSceneName: obsBibleCamInput
              ? obsBibleCamInput.value.trim() || 'Biblia Camara'
              : 'Biblia Camara',
            audioRootDir: obsAudioRootInput ? obsAudioRootInput.value.trim() : undefined,
          }),
        });
        await fetchHymnsIndex();
        if (selectedHymn) {
          await selectHymnByNumber(selectedHymn.number, { updateInputs: false });
        }
        obsModal.hidden = true;
      } catch (err) {
        console.error('Error guardando configuración OBS:', err);
      }
    });
  }

  // Sincronización con Socket.IO
  socket.on('state:update', (state) => {
    liveState = state;
    if (state && state.advanceMode) {
      advanceMode = state.advanceMode;
      advanceModeButtons.forEach((b) =>
        b.classList.toggle('active', b.dataset.advance === advanceMode)
      );
    }
    updateManualNavState();
    updatePlaybackButtons();
  });

  socket.on('bible:update', (state) => {
    liveBibleState = state;
    if (state && state.sceneMode) {
      bibleSceneMode = state.sceneMode;
      bibleSceneButtons.forEach((b) =>
        b.classList.toggle('active', b.dataset.scene === bibleSceneMode)
      );
    }
    updateBibleButtonsState();
    renderBibleChapterList({ scroll: false });
  });

  socket.on('obs:status', (status) => {
    if (!obsStatusDot || !btnObsConfig) return;
    const isConn = Boolean(status && status.connected);
    obsStatusDot.className = `obs-mini-dot ${isConn ? 'connected' : 'disconnected'}`;
    const label = isConn
      ? 'OBS conectado (clic para configurar escenas)'
      : 'OBS desconectado (clic para configurar)';
    btnObsConfig.title = label;
    btnObsConfig.dataset.tooltip = label;
  });

  // Inicializar
  fetchHymnsIndex();
  fetchBibleBooks();
  updateManualNavState();
  updatePlaybackButtons();
  updateBibleButtonsState();
})();
