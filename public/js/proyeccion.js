/**
 * ============================================================================
 *  PROYECCIÓN DE HIMNARIO: Biblia e Himnario Adventista para OBS Studio
 *  AUTOR:                  Ing. Rubén Humberto Armendáriz Tamayo
 *  TÍTULO:                 Ingeniero en Sistemas Computacionales
 * ============================================================================
 */
(() => {
  const socket = io();

  const projectionRoot = document.getElementById('projectionRoot');
  const projHymnNumber = document.getElementById('projHymnNumber');
  const projHymnTitle = document.getElementById('projHymnTitle');
  const projSlideLabel = document.getElementById('projSlideLabel');
  const projSlideContent = document.getElementById('projSlideContent');
  const projSubtext = document.getElementById('projSubtext');
  const projDots = document.getElementById('projDots');
  const projProgressBar = document.getElementById('projProgressBar');
  const audioEl = document.getElementById('projectionAudio');

  let currentHymnNumber = null;
  let currentSlideIdx = -1;
  let currentAudioUrl = null;

  function renderProjection(state) {
    if (!state || !state.active || !state.hymn) {
      projectionRoot.classList.add('hidden');
      return;
    }

    projectionRoot.classList.remove('hidden');
    const hymn = state.hymn;
    const slides = hymn.slides || [];
    const idx = Math.max(0, Math.min(slides.length - 1, state.currentSlideIndex || 0));
    const slide = slides[idx];

    projHymnNumber.textContent = `Himno #${hymn.number}`;
    projHymnTitle.textContent = hymn.title;

    if (slide) {
      projSlideLabel.textContent = slide.label || '';
      projSlideLabel.className = `proj-verse-tag ${slide.type || 'verse'}`;

      // Animar transición si cambió el himno o la diapositiva
      if (currentHymnNumber !== hymn.number || currentSlideIdx !== idx) {
        currentHymnNumber = hymn.number;
        currentSlideIdx = idx;

        projSlideContent.classList.remove('fade-in');
        void projSlideContent.offsetWidth; // reflow para reiniciar animación
        projSlideContent.className = `proj-lyrics ${slide.type || 'verse'} fade-in`;
        projSlideContent.innerHTML = (slide.text || '').replace(/\n/g, '<br>');
        projSubtext.textContent = slide.subtext || '';
      }
    }

    // Indicadores de diapositivas (puntos inferiores)
    projDots.innerHTML = '';
    slides.forEach((s, i) => {
      const dot = document.createElement('span');
      dot.className = `proj-dot ${s.type} ${i === idx ? 'active' : ''}`;
      projDots.appendChild(dot);
    });

    if (state.audioMode === 'letra') {
      const pct = slides.length > 1 ? ((idx + 1) / slides.length) * 100 : 100;
      projProgressBar.style.width = `${pct}%`;
    }
  }

  // Cargar nuevo himno y arrancar el audio si corresponde
  socket.on('project:load', ({ state }) => {
    currentHymnNumber = null;
    currentSlideIdx = -1;
    renderProjection(state);

    audioEl.pause();
    audioEl.currentTime = 0;

    if (state && state.active && state.audioMode !== 'letra' && state.audioUrl) {
      currentAudioUrl = state.audioUrl;
      audioEl.src = state.audioUrl;
      audioEl.load();
      audioEl.play().catch((err) => {
        console.warn('Autoplay bloqueado o archivo no disponible:', err.message);
      });
    } else {
      currentAudioUrl = null;
      audioEl.removeAttribute('src');
      projProgressBar.style.width = '0%';
    }
  });

  // Actualizar diapositiva o estado
  socket.on('state:update', (state) => {
    renderProjection(state);
    // Si la ventana de proyección se abrió después de haber iniciado un himno
    if (
      state &&
      state.active &&
      state.audioMode !== 'letra' &&
      state.audioUrl &&
      currentAudioUrl !== state.audioUrl
    ) {
      currentAudioUrl = state.audioUrl;
      audioEl.src = state.audioUrl;
      if (state.currentTime > 0) {
        audioEl.currentTime = state.currentTime;
      }
      if (state.isPlaying) {
        audioEl.play().catch(() => {});
      }
    }
  });

  // Controles de audio (play, pause, seek, stop)
  socket.on('audio:control', (cmd = {}) => {
    if (cmd.action === 'play') {
      audioEl.play().catch(() => {});
    } else if (cmd.action === 'pause') {
      audioEl.pause();
    } else if (cmd.action === 'seek' && typeof cmd.time === 'number') {
      audioEl.currentTime = cmd.time;
    } else if (cmd.action === 'stop') {
      audioEl.pause();
      audioEl.currentTime = 0;
      currentAudioUrl = null;
      projProgressBar.style.width = '0%';
    }
  });

  // Reportar tiempo de reproducción al servidor para el avance automático
  audioEl.addEventListener('timeupdate', () => {
    const currentTime = audioEl.currentTime || 0;
    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    if (duration > 0) {
      const pct = Math.min(100, (currentTime / duration) * 100);
      projProgressBar.style.width = `${pct}%`;
    }
    socket.emit('audio:timeupdate', { currentTime, duration });
  });

  audioEl.addEventListener('loadedmetadata', () => {
    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    socket.emit('audio:timeupdate', { currentTime: audioEl.currentTime || 0, duration });
  });

  audioEl.addEventListener('ended', () => {
    socket.emit('audio:ended');
  });
})();
