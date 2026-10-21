/**
 * ============================================================================
 *  PROYECCIÓN DE BIBLIA: Biblia e Himnario Adventista para OBS Studio
 *  AUTOR:                Ing. Rubén Humberto Armendáriz Tamayo
 *  TÍTULO:               Ingeniero en Sistemas Computacionales
 * ============================================================================
 */
(() => {
  const socket = io();

  const root = document.getElementById('bibleProjectionRoot');
  const overlay = document.getElementById('bibleCardOverlay');
  const refBadge = document.getElementById('bibleRefBadge');
  const verBadge = document.getElementById('bibleVersionBadge');
  const verseText = document.getElementById('bibleVerseText');

  let lastKey = '';

  function renderBible(state) {
    if (!state || !state.active || !state.text) {
      root.classList.add('hidden');
      return;
    }

    root.classList.remove('hidden');
    overlay.className = `bible-card-overlay mode-${state.sceneMode || 'fondo'}`;

    const refStr = `${state.bookName} ${state.chapter}:${state.verseLabel || state.verse}`;
    refBadge.textContent = refStr;
    verBadge.textContent = state.version === 'DHH' ? 'DHH' : 'RVR1960';

    const currentKey = `${state.version}:${state.bookId}:${state.chapter}:${state.verse}`;
    if (currentKey !== lastKey) {
      lastKey = currentKey;
      verseText.classList.remove('fade-in');
      void verseText.offsetWidth;
      verseText.classList.add('fade-in');
    }

    // Ajustar tamaño de letra dinámicamente si el versículo es muy largo (ej. Éxodo 20:10)
    const len = (state.text || '').length;
    verseText.classList.remove('size-lg', 'size-md', 'size-sm');
    if (len > 260) {
      verseText.classList.add('size-sm');
    } else if (len > 150) {
      verseText.classList.add('size-md');
    } else {
      verseText.classList.add('size-lg');
    }

    verseText.textContent = state.text;
  }

  socket.on('bible:update', (state) => {
    renderBible(state);
  });
})();
