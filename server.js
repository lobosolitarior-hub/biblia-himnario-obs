const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { Server } = require('socket.io');
const { OBSWebSocket } = require('obs-websocket-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const obs = new OBSWebSocket();

const PORT = process.env.PORT || 3000;

// Directorio de datos empaquetados (JSON de himnos y biblias)
const DATA_DIR = path.join(__dirname, 'data');

// Directorio escribible del usuario para guardar config.json cuando está instalado
const USER_DATA_DIR = process.env.APP_USER_DATA_DIR || DATA_DIR;
if (!fs.existsSync(USER_DATA_DIR)) {
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  } catch {}
}

// Carpeta en Documentos donde las iglesias pueden copiar sus MP3 fácilmente
const DOCUMENTS_BASE =
  process.env.APP_DOCUMENTS_DIR || path.join(os.homedir(), 'Documents');
const DEFAULT_USER_AUDIO_ROOT = path.join(DOCUMENTS_BASE, 'Biblia e Himnario OBS');
const USER_CANTADO_DIR = path.join(DEFAULT_USER_AUDIO_ROOT, 'Cantado');
const USER_INSTRUMENTAL_DIR = path.join(DEFAULT_USER_AUDIO_ROOT, 'Instrumental');

// Carpetas locales del proyecto (desarrollo o portables)
const CANTADO_DIR = path.join(__dirname, 'Cantado');
const CANTADO_LOWER_DIR = path.join(__dirname, 'cantado');
const INSTRUMENTAL_DIR = path.join(__dirname, 'Instrumental');
const INSTRUMENTAL_LOWER_DIR = path.join(__dirname, 'instrumental');
const INSTRUMNTAL_ALT_DIR = path.join(__dirname, 'instrumntal');

// Asegurar que las carpetas en Documentos existan para que el usuario pueda pegar sus MP3
function ensureUserAudioFolders(rootDir) {
  const base = rootDir || DEFAULT_USER_AUDIO_ROOT;
  const cantado = path.join(base, 'Cantado');
  const instrumental = path.join(base, 'Instrumental');
  [base, cantado, instrumental].forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {}
  });

  const readmePath = path.join(base, 'LEEME - Copiar MP3 aqui.txt');
  if (!fs.existsSync(readmePath)) {
    try {
      fs.writeFileSync(
        readmePath,
        [
          '==============================================================',
          '  BIBLIA E HIMNARIO OBS - CARPETAS DE AUDIO MP3 (614 HIMNOS)',
          '==============================================================',
          '',
          '1. Copia tus pistas cantadas (.mp3) dentro de la carpeta:',
          `   ${cantado}`,
          '',
          '2. Copia tus pistas instrumentales (.mp3) dentro de la carpeta:',
          `   ${instrumental}`,
          '',
          'Formatos de nombre reconocidos automáticamente:',
          '  - 001.mp3, 01.mp3, 1.mp3',
          '  - 001 - Cantad alegres al Senor.mp3',
          '  - Himno 001.mp3',
          '',
        ].join('\n'),
        'utf8'
      );
    } catch {}
  }
}
ensureUserAudioFolders(DEFAULT_USER_AUDIO_ROOT);

// Configuración persistente de OBS y rutas
const CONFIG_PATH = path.join(USER_DATA_DIR, 'config.json');
const BUNDLED_CONFIG_PATH = path.join(DATA_DIR, 'config.json');
let obsConfig = {
  url: process.env.OBS_WS_URL || 'ws://127.0.0.1:4455',
  password: process.env.OBS_WS_PASSWORD || '',
  sceneName: process.env.OBS_SCENE_NAME || 'Himnario',
  bibleBgSceneName: process.env.OBS_BIBLE_BG_SCENE || 'Biblia',
  bibleCamSceneName: process.env.OBS_BIBLE_CAM_SCENE || 'Biblia Camara',
  audioRootDir: DEFAULT_USER_AUDIO_ROOT,
  autoSwitchScene: true,
  soloLetraIntervalSec: 12,
  useOnlineFallback: true,
};

function normalizeObsUrl(input) {
  let u = String(input || '').trim();
  if (!u) return 'ws://127.0.0.1:4455';
  if (/^\d+$/.test(u)) return `ws://127.0.0.1:${u}`;
  if (u.startsWith('://')) return `ws${u}`;
  if (!u.startsWith('ws://') && !u.startsWith('wss://')) {
    u = u.replace(/^[a-zA-Z]*:\/\//, '');
    return `ws://${u}`;
  }
  return u;
}

// Si no existe config.json en USER_DATA_DIR pero sí en DATA_DIR empaquetado, copiarlo como base
if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(BUNDLED_CONFIG_PATH)) {
  try {
    fs.copyFileSync(BUNDLED_CONFIG_PATH, CONFIG_PATH);
  } catch {}
}

if (fs.existsSync(CONFIG_PATH)) {
  try {
    obsConfig = { ...obsConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    obsConfig.url = normalizeObsUrl(obsConfig.url);
    if (obsConfig.audioRootDir) {
      ensureUserAudioFolders(obsConfig.audioRootDir);
    }
  } catch (err) {
    console.error('Error leyendo config.json:', err.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(obsConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando config.json:', err.message);
  }
}

// Cargar los 614 himnos desde data/himnos.json
const HIMNOS_PATH = path.join(DATA_DIR, 'himnos.json');
let himnos = [];
const himnosByNumber = new Map();

function loadHimnos() {
  if (!fs.existsSync(HIMNOS_PATH)) {
    console.warn('Advertencia: No se encontró data/himnos.json');
    return;
  }
  himnos = JSON.parse(fs.readFileSync(HIMNOS_PATH, 'utf8'));
  himnosByNumber.clear();
  for (const h of himnos) {
    himnosByNumber.set(Number(h.number), h);
  }
  console.log(`✅ Cargados ${himnos.length} himnos del Himnario Adventista.`);
}
loadHimnos();

// Cargar Biblias (Reina Valera 1960 y Dios Habla Hoy)
const bibles = {
  RVR1960: null,
  DHH: null,
};
const bibleBooksIndex = [];

function loadBibles() {
  const rvrPath = path.join(DATA_DIR, 'biblia_rvr1960.json');
  const dhhPath = path.join(DATA_DIR, 'biblia_dhh.json');

  if (fs.existsSync(rvrPath)) {
    bibles.RVR1960 = JSON.parse(fs.readFileSync(rvrPath, 'utf8'));
    console.log(`✅ Cargada Biblia RVR1960 (${bibles.RVR1960.books.length} libros).`);
  }
  if (fs.existsSync(dhhPath)) {
    bibles.DHH = JSON.parse(fs.readFileSync(dhhPath, 'utf8'));
    console.log(`✅ Cargada Biblia DHH (${bibles.DHH.books.length} libros).`);
  }

  const baseBible = bibles.RVR1960 || bibles.DHH;
  if (baseBible) {
    bibleBooksIndex.length = 0;
    for (const b of baseBible.books) {
      bibleBooksIndex.push({
        id: b.id,
        number: b.number,
        name: b.name,
        aliases: b.aliases || [],
        chaptersCount: b.chapters.length,
      });
    }
  }
}
loadBibles();

// Configurar motor de plantillas Pug y archivos estáticos
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Directorios dinámicos para buscar pistas MP3 (en la carpeta elegida por la iglesia, en Documentos y en el proyecto local)
function getCantadoFolders() {
  const customRoot = obsConfig.audioRootDir || DEFAULT_USER_AUDIO_ROOT;
  return [
    path.join(customRoot, 'Cantado'),
    path.join(customRoot, 'cantado'),
    USER_CANTADO_DIR,
    CANTADO_DIR,
    CANTADO_LOWER_DIR,
  ];
}

function getInstrumentalFolders() {
  const customRoot = obsConfig.audioRootDir || DEFAULT_USER_AUDIO_ROOT;
  return [
    path.join(customRoot, 'Instrumental'),
    path.join(customRoot, 'instrumental'),
    USER_INSTRUMENTAL_DIR,
    INSTRUMENTAL_DIR,
    INSTRUMENTAL_LOWER_DIR,
    INSTRUMNTAL_ALT_DIR,
  ];
}

function resolveAudioFileFromFolders(folderList, filename) {
  const safeName = path.basename(filename);
  for (const dir of folderList) {
    const candidate = path.join(dir, safeName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

app.get('/audio/cantado/:filename', (req, res) => {
  const fullPath = resolveAudioFileFromFolders(getCantadoFolders(), req.params.filename);
  if (!fullPath) return res.status(404).end();
  res.sendFile(fullPath);
});

app.get('/audio/instrumental/:filename', (req, res) => {
  const fullPath = resolveAudioFileFromFolders(
    getInstrumentalFolders(),
    req.params.filename
  );
  if (!fullPath) return res.status(404).end();
  res.sendFile(fullPath);
});

// Extensiones de audio soportadas
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

/**
 * Busca en una carpeta el archivo de audio que corresponda al número de himno (1..614).
 * Soporta nombres como:
 *  - "001.mp3", "01.mp3", "1.mp3"
 *  - "001 - Cantad alegres al Senor.mp3"
 *  - "Himno 001.mp3", "himno_1.mp3", "001_cantad.mp3"
 */
function findLocalAudioFile(folderPaths, hymnNumber) {
  const num = Number(hymnNumber);
  const pad3 = String(num).padStart(3, '0');
  const pad2 = String(num).padStart(2, '0');
  const raw = String(num);

  for (const dirPath of folderPaths) {
    if (!fs.existsSync(dirPath)) continue;
    let files = [];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    const audioFiles = files.filter((f) =>
      AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase())
    );

    // 1. Coincidencia exacta o inicio con 3 dígitos (ej. "001.mp3", "001 - ...")
    let match = audioFiles.find((f) => {
      const base = path.basename(f, path.extname(f));
      return (
        base === pad3 ||
        base === raw ||
        base === pad2 ||
        new RegExp(`^0*${num}(?:\\D|$)`).test(base) ||
        new RegExp(`(?:^|\\D)0*${num}(?:\\D|$)`).test(base)
      );
    });

    if (match) {
      return match;
    }
  }
  return null;
}

function getHymnAudioInfo(hymn) {
  if (!hymn) return {};
  const cantadoFile = findLocalAudioFile(getCantadoFolders(), hymn.number);
  const instrumentalFile = findLocalAudioFile(getInstrumentalFolders(), hymn.number);

  return {
    hasLocalCantado: Boolean(cantadoFile),
    hasLocalInstrumental: Boolean(instrumentalFile),
    localCantadoUrl: cantadoFile
      ? `/audio/cantado/${encodeURIComponent(cantadoFile)}`
      : null,
    localInstrumentalUrl: instrumentalFile
      ? `/audio/instrumental/${encodeURIComponent(instrumentalFile)}`
      : null,
    onlineCantadoUrl: hymn.mp3Url || null,
    onlineInstrumentalUrl: hymn.mp3UrlInstr || null,
  };
}

// Conexión con OBS WebSocket
let obsConnected = false;
let obsLastError = '';
let previousSceneName = null; // Escena que estaba en Programa antes de pasar a "Himnario"

async function connectOBS() {
  try {
    await obs.disconnect().catch(() => {});
    if (obsConfig.password) {
      await obs.connect(obsConfig.url, obsConfig.password);
    } else {
      await obs.connect(obsConfig.url);
    }
    obsConnected = true;
    obsLastError = '';
    console.log(`🎥 Conectado a OBS WebSocket en ${obsConfig.url}`);
    io.emit('obs:status', { connected: true, config: getSafeObsConfig() });
  } catch (err) {
    obsConnected = false;
    obsLastError = err.message || 'No se pudo conectar a OBS WebSocket';
    io.emit('obs:status', {
      connected: false,
      error: obsLastError,
      config: getSafeObsConfig(),
    });
  }
}

obs.on('ConnectionClosed', () => {
  obsConnected = false;
  io.emit('obs:status', { connected: false, config: getSafeObsConfig() });
});

function isHymnSceneName(sceneName) {
  if (!sceneName) return false;
  return (
    String(sceneName).trim().toLowerCase() ===
    String(obsConfig.sceneName || 'Himnario').trim().toLowerCase()
  );
}

function isBibleSceneName(sceneName) {
  if (!sceneName) return false;
  const s = String(sceneName).trim().toLowerCase();
  const bg = String(obsConfig.bibleBgSceneName || 'Biblia').trim().toLowerCase();
  const cam = String(obsConfig.bibleCamSceneName || 'Biblia Camara').trim().toLowerCase();
  return s === bg || s === cam;
}

function stopHymnProjection() {
  stopSoloLetraTimer();
  projectionState = {
    ...projectionState,
    active: false,
    isPlaying: false,
    currentTime: 0,
    currentSlideIndex: 0,
  };
  io.emit('audio:control', { action: 'stop' });
  io.emit('state:update', projectionState);
}

// Detectar cuando en OBS se cambia manualmente de escena en Programa/Stream
obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
  if (!sceneName) return;

  // Si salimos de la escena "Himnario" hacia cualquier otra escena (cámara, video, imagen, biblia)
  // detener automáticamente la reproducción del himno
  if (!isHymnSceneName(sceneName) && (projectionState.active || projectionState.isPlaying)) {
    console.log(`⏹ Escena cambiada a "${sceneName}" en OBS: deteniendo himno.`);
    stopHymnProjection();
  }

  // Si salimos de las escenas de Biblia hacia otra escena, desactivar estado de Biblia
  if (!isBibleSceneName(sceneName) && bibleState.active) {
    bibleState = {
      ...bibleState,
      active: false,
    };
    io.emit('bible:update', bibleState);
  }

  // Si el operador cambió manualmente a una escena de cámara/video/imagen, recordarla como escena base
  if (!isManagedProjectionScene(sceneName)) {
    previousSceneName = sceneName;
  }
});

// Reintentar conexión automáticamente cada 5s si OBS se abre después del servidor
setInterval(() => {
  if (!obsConnected) {
    connectOBS();
  }
}, 5000);

function getSafeObsConfig() {
  return {
    url: obsConfig.url,
    password: obsConfig.password || '',
    hasPassword: Boolean(obsConfig.password),
    sceneName: obsConfig.sceneName,
    bibleBgSceneName: obsConfig.bibleBgSceneName || 'Biblia',
    bibleCamSceneName: obsConfig.bibleCamSceneName || 'Biblia Camara',
    audioRootDir: obsConfig.audioRootDir || DEFAULT_USER_AUDIO_ROOT,
    autoSwitchScene: obsConfig.autoSwitchScene,
    soloLetraIntervalSec: obsConfig.soloLetraIntervalSec,
    useOnlineFallback: obsConfig.useOnlineFallback,
  };
}

/**
 * Busca el nombre exacto de la escena en OBS (sin importar mayúsculas/minúsculas o tildes)
 * y devuelve también la escena actual en Programa.
 */
async function resolveObsScene(targetName) {
  const { currentProgramSceneName, scenes = [] } = await obs.call('GetSceneList');
  const cleanTarget = String(targetName || 'Himnario').trim().toLowerCase();
  const found = scenes.find(
    (s) => String(s.sceneName || '').trim().toLowerCase() === cleanTarget
  );
  return {
    currentProgramSceneName,
    resolvedSceneName: found ? found.sceneName : targetName || 'Himnario',
  };
}

function isManagedProjectionScene(sceneName) {
  if (!sceneName) return false;
  const s = String(sceneName).trim().toLowerCase();
  const managed = [
    obsConfig.sceneName || 'Himnario',
    obsConfig.bibleBgSceneName || 'Biblia',
    obsConfig.bibleCamSceneName || 'Biblia Camara',
  ].map((n) => String(n).trim().toLowerCase());
  return managed.includes(s);
}

async function switchToTargetScene(desiredSceneName) {
  if (!obsConfig.autoSwitchScene) return { switched: false };
  if (!obsConnected) {
    await connectOBS();
  }
  if (!obsConnected) {
    return { switched: false, error: obsLastError };
  }
  try {
    const desiredScene = desiredSceneName || 'Himnario';
    const { currentProgramSceneName, resolvedSceneName } =
      await resolveObsScene(desiredScene);

    // Guardar la escena previa de cámara/predicador si no estamos en una escena de proyección
    if (
      currentProgramSceneName &&
      !isManagedProjectionScene(currentProgramSceneName)
    ) {
      previousSceneName = currentProgramSceneName;
    }

    // Cambiar la escena en Programa/Stream (dispara la transición activa en OBS)
    await obs.call('SetCurrentProgramScene', {
      sceneName: resolvedSceneName,
    });
    return { switched: true, sceneName: resolvedSceneName };
  } catch (err) {
    return {
      switched: false,
      error: `No se pudo cambiar a la escena "${desiredSceneName}": ${err.message}`,
    };
  }
}

async function switchToHymnScene() {
  return switchToTargetScene(obsConfig.sceneName || 'Himnario');
}

async function switchToBibleScene(sceneMode) {
  const target =
    sceneMode === 'camara'
      ? obsConfig.bibleCamSceneName || 'Biblia Camara'
      : obsConfig.bibleBgSceneName || 'Biblia';
  return switchToTargetScene(target);
}

async function restorePreviousScene() {
  if (!obsConfig.autoSwitchScene || !previousSceneName) {
    return { restored: false };
  }
  if (!obsConnected) {
    await connectOBS();
  }
  if (!obsConnected) {
    return { restored: false, error: obsLastError };
  }
  try {
    const targetToRestore = previousSceneName;
    previousSceneName = null;
    await obs.call('SetCurrentProgramScene', {
      sceneName: targetToRestore,
    });
    return { restored: true, sceneName: targetToRestore };
  } catch (err) {
    return {
      restored: false,
      error: `No se pudo regresar a la escena "${previousSceneName}": ${err.message}`,
    };
  }
}

// Intentar conectar a OBS al iniciar el servidor (sin bloquear si OBS está cerrado)
connectOBS();

// Estado en vivo de la proyección de Himnario
let projectionState = {
  active: false,
  hymn: null,
  audioMode: 'cantado', // 'cantado' | 'instrumental' | 'letra'
  advanceMode: 'auto', // 'auto' | 'manual'
  audioUrl: null,
  isLocalAudio: false,
  currentSlideIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  computedSchedule: [], // Marcas de tiempo en segundos para cada diapositiva
};

// Estado en vivo de la proyección de Biblia
let bibleState = {
  active: false,
  version: 'RVR1960', // 'RVR1960' | 'DHH'
  versionName: 'Reina Valera 1960',
  bookId: 'GEN',
  bookName: 'Génesis',
  chapter: 1,
  verse: 1,
  verseLabel: '1',
  text: '',
  sceneMode: 'fondo', // 'fondo' | 'camara'
};

function getBibleVerseData(versionCode, bookId, chapterNum, verseNum) {
  const verKey = versionCode === 'DHH' ? 'DHH' : 'RVR1960';
  const bible = bibles[verKey] || bibles.RVR1960 || bibles.DHH;
  if (!bible) return null;

  const book =
    bible.books.find(
      (b) =>
        b.id.toLowerCase() === String(bookId).toLowerCase() ||
        Number(b.number) === Number(bookId)
    ) || bible.books[0];
  if (!book) return null;

  const chIdx = Math.max(
    0,
    Math.min(book.chapters.length - 1, (Number(chapterNum) || 1) - 1)
  );
  const chObj = book.chapters[chIdx];
  if (!chObj || !Array.isArray(chObj.verses) || chObj.verses.length === 0) {
    return null;
  }

  const targetV = Number(verseNum) || 1;
  const verseObj =
    chObj.verses.find((v) => v.v === targetV) ||
    chObj.verses.find((v) => v.v >= targetV) ||
    chObj.verses[0];

  return {
    version: bible.version,
    versionName: bible.name,
    bookId: book.id,
    bookName: book.name,
    chapter: chObj.c,
    totalChapters: book.chapters.length,
    verse: verseObj.v,
    verseLabel: verseObj.label || String(verseObj.v),
    text: verseObj.text,
    verses: chObj.verses,
  };
}

// Temporizador para el modo "Solo letra" en avance automático
let soloLetraTimer = null;

function stopSoloLetraTimer() {
  if (soloLetraTimer) {
    clearInterval(soloLetraTimer);
    soloLetraTimer = null;
  }
}

function startSoloLetraTimer() {
  stopSoloLetraTimer();
  if (
    projectionState.active &&
    projectionState.audioMode === 'letra' &&
    projectionState.advanceMode === 'auto' &&
    projectionState.isPlaying &&
    projectionState.hymn
  ) {
    const intervalMs = Math.max(3, Number(obsConfig.soloLetraIntervalSec) || 12) * 1000;
    soloLetraTimer = setInterval(() => {
      if (
        !projectionState.active ||
        projectionState.advanceMode !== 'auto' ||
        !projectionState.isPlaying
      ) {
        return;
      }
      const totalSlides = projectionState.hymn.slides.length;
      if (projectionState.currentSlideIndex < totalSlides - 1) {
        projectionState.currentSlideIndex += 1;
        io.emit('state:update', projectionState);
      } else {
        projectionState.isPlaying = false;
        stopSoloLetraTimer();
        io.emit('state:update', projectionState);
      }
    }, intervalMs);
  }
}

/**
 * Calcula los tiempos de entrada (en segundos) de cada diapositiva.
 * - Si el himno ya tiene timestamps en la base de datos y coinciden con la duración, los usa.
 * - Si no tiene timestamps (o si la duración del archivo de audio difiere mucho), los calcula
 *   proporcionalmente según la longitud del texto de cada diapositiva + intro musical.
 */
function buildSlideSchedule(hymn, audioDurationSec) {
  if (!hymn || !Array.isArray(hymn.slides) || hymn.slides.length === 0) {
    return [];
  }
  const slides = hymn.slides;
  const hasDbTimestamps = slides
    .slice(1)
    .every((s) => typeof s.timestamp === 'number' && s.timestamp > 0);

  if (hasDbTimestamps) {
    const lastDbTime = slides[slides.length - 1].timestamp;
    // Si aún no conocemos la duración del audio o las marcas caben bien dentro del audio
    if (!audioDurationSec || audioDurationSec >= lastDbTime + 3) {
      return slides.map((s, idx) => (idx === 0 ? 0 : s.timestamp));
    }
    // Escalar proporcionalmente si el audio local tiene un tempo diferente
    const scale = (audioDurationSec * 0.88) / lastDbTime;
    return slides.map((s, idx) =>
      idx === 0 ? 0 : Math.round(s.timestamp * scale * 10) / 10
    );
  }

  // Cálculo automático proporcional basado en la duración del audio
  const totalDuration = audioDurationSec && audioDurationSec > 15 ? audioDurationSec : 150;
  const introSec = Math.min(18, Math.max(8, totalDuration * 0.1));
  const outroSec = Math.min(8, totalDuration * 0.04);
  const singingWindow = Math.max(20, totalDuration - introSec - outroSec);

  const lyricSlides = slides.slice(1);
  if (lyricSlides.length === 0) return [0];

  const weights = lyricSlides.map((s) => Math.max(20, (s.text || '').length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const schedule = [0];
  let elapsed = introSec;
  for (let i = 0; i < lyricSlides.length; i++) {
    schedule.push(Math.round(elapsed * 10) / 10);
    elapsed += (weights[i] / totalWeight) * singingWindow;
  }
  return schedule;
}

// Rutas de vistas (Pug)
app.get(['/', '/panel'], (req, res) => {
  res.render('panel', {
    title: 'Biblia e Himnario - Panel OBS',
    obsConfig: getSafeObsConfig(),
    obsConnected,
  });
});

app.get(['/proyeccion', '/himnario'], (req, res) => {
  res.render('proyeccion', {
    title: 'Himnario Adventista - Proyección OBS',
  });
});

app.get(['/biblia', '/proyeccion-biblia'], (req, res) => {
  res.render('biblia', {
    title: 'Biblia - Proyección OBS',
  });
});

// API REST para Biblia (RVR1960 y DHH)
app.get('/api/biblia/libros', (req, res) => {
  res.json(bibleBooksIndex);
});

app.get('/api/biblia/:version/:bookId/:chapter', (req, res) => {
  const { version, bookId, chapter } = req.params;
  const data = getBibleVerseData(version, bookId, Number(chapter) || 1, 1);
  if (!data) {
    return res.status(404).json({ error: 'Capítulo no encontrado' });
  }
  res.json({
    version: data.version,
    versionName: data.versionName,
    bookId: data.bookId,
    bookName: data.bookName,
    chapter: data.chapter,
    totalChapters: data.totalChapters,
    verses: data.verses,
  });
});

// API REST para búsqueda rápida y estado de audios
app.get('/api/himnos', (req, res) => {
  const list = himnos.map((h) => {
    const audioInfo = getHymnAudioInfo(h);
    return {
      number: h.number,
      title: h.title,
      bibleReference: h.bibleReference,
      slidesCount: h.slides.length,
      hasLocalCantado: audioInfo.hasLocalCantado,
      hasLocalInstrumental: audioInfo.hasLocalInstrumental,
    };
  });
  res.json(list);
});

app.get('/api/himnos/:number', (req, res) => {
  const num = Number(req.params.number);
  const hymn = himnosByNumber.get(num);
  if (!hymn) {
    return res.status(404).json({ error: 'Himno no encontrado' });
  }
  const audioInfo = getHymnAudioInfo(hymn);
  res.json({
    ...hymn,
    audioInfo,
    computedSchedule: buildSlideSchedule(hymn, 0),
  });
});

function openAudioFolderInOS() {
  const folder = obsConfig.audioRootDir || DEFAULT_USER_AUDIO_ROOT;
  ensureUserAudioFolders(folder);
  const cmd =
    process.platform === 'win32'
      ? 'explorer'
      : process.platform === 'darwin'
      ? 'open'
      : 'xdg-open';
  execFile(cmd, [folder], () => {});
  return folder;
}

function setAudioRootDir(newFolder) {
  if (!newFolder) return;
  obsConfig.audioRootDir = newFolder;
  ensureUserAudioFolders(newFolder);
  saveConfig();
  io.emit('obs:status', {
    connected: obsConnected,
    error: obsLastError,
    config: getSafeObsConfig(),
  });
}

app.post('/api/audio/open-folder', (req, res) => {
  const folder = openAudioFolderInOS();
  res.json({ ok: true, folder });
});

app.post('/api/obs/config', async (req, res) => {
  const {
    url,
    password,
    sceneName,
    bibleBgSceneName,
    bibleCamSceneName,
    audioRootDir,
    autoSwitchScene,
    soloLetraIntervalSec,
    useOnlineFallback,
  } = req.body || {};
  if (typeof url === 'string') obsConfig.url = normalizeObsUrl(url);
  if (typeof password === 'string') obsConfig.password = password.trim();
  if (typeof sceneName === 'string' && sceneName.trim()) {
    obsConfig.sceneName = sceneName.trim();
  }
  if (typeof bibleBgSceneName === 'string' && bibleBgSceneName.trim()) {
    obsConfig.bibleBgSceneName = bibleBgSceneName.trim();
  }
  if (typeof bibleCamSceneName === 'string' && bibleCamSceneName.trim()) {
    obsConfig.bibleCamSceneName = bibleCamSceneName.trim();
  }
  if (typeof audioRootDir === 'string' && audioRootDir.trim()) {
    obsConfig.audioRootDir = audioRootDir.trim();
    ensureUserAudioFolders(obsConfig.audioRootDir);
  }
  if (typeof autoSwitchScene === 'boolean') obsConfig.autoSwitchScene = autoSwitchScene;
  if (soloLetraIntervalSec !== undefined) {
    obsConfig.soloLetraIntervalSec = Math.max(3, Number(soloLetraIntervalSec) || 12);
  }
  if (typeof useOnlineFallback === 'boolean') {
    obsConfig.useOnlineFallback = useOnlineFallback;
  }

  saveConfig();
  await connectOBS();
  res.json({
    connected: obsConnected,
    error: obsLastError,
    config: getSafeObsConfig(),
  });
});

// Comunicación en tiempo real con Socket.IO
io.on('connection', (socket) => {
  // Enviar estado actual al conectarse
  socket.emit('state:update', projectionState);
  socket.emit('bible:update', bibleState);
  socket.emit('obs:status', {
    connected: obsConnected,
    error: obsLastError,
    config: getSafeObsConfig(),
  });

  // Iniciar proyección de un himno en la escena "Himnario"
  socket.on('project:start', async (payload = {}) => {
    const num = Number(payload.number);
    const hymn = himnosByNumber.get(num);
    if (!hymn) return;

    const audioMode = ['cantado', 'instrumental', 'letra'].includes(payload.audioMode)
      ? payload.audioMode
      : 'cantado';
    const advanceMode = ['auto', 'manual'].includes(payload.advanceMode)
      ? payload.advanceMode
      : 'auto';

    const audioInfo = getHymnAudioInfo(hymn);
    let audioUrl = null;
    let isLocalAudio = false;

    if (audioMode === 'cantado') {
      if (audioInfo.localCantadoUrl) {
        audioUrl = audioInfo.localCantadoUrl;
        isLocalAudio = true;
      } else if (obsConfig.useOnlineFallback && audioInfo.onlineCantadoUrl) {
        audioUrl = audioInfo.onlineCantadoUrl;
      }
    } else if (audioMode === 'instrumental') {
      if (audioInfo.localInstrumentalUrl) {
        audioUrl = audioInfo.localInstrumentalUrl;
        isLocalAudio = true;
      } else if (obsConfig.useOnlineFallback && audioInfo.onlineInstrumentalUrl) {
        audioUrl = audioInfo.onlineInstrumentalUrl;
      }
    }

    const schedule = buildSlideSchedule(hymn, 0);

    projectionState = {
      active: true,
      hymn: {
        number: hymn.number,
        title: hymn.title,
        bibleReference: hymn.bibleReference,
        slides: hymn.slides,
        audioInfo,
      },
      audioMode,
      advanceMode,
      audioUrl,
      isLocalAudio,
      currentSlideIndex:
        typeof payload.startSlideIndex === 'number' ? payload.startSlideIndex : 0,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      computedSchedule: schedule,
    };

    // Cambiar automáticamente a la escena "Himnario" en OBS si está activo
    const obsResult = await switchToHymnScene();

    io.emit('project:load', {
      state: projectionState,
      obsResult,
    });
    io.emit('state:update', projectionState);

    if (audioMode === 'letra') {
      startSoloLetraTimer();
    } else {
      stopSoloLetraTimer();
    }
  });

  // Cambiar de diapositiva manualmente (Anterior / Siguiente / Clic directo)
  socket.on('project:slide', (payload = {}) => {
    if (!projectionState.hymn) return;
    const total = projectionState.hymn.slides.length;
    let nextIndex = projectionState.currentSlideIndex;

    if (typeof payload.index === 'number') {
      nextIndex = payload.index;
    } else if (payload.direction === 'next') {
      nextIndex += 1;
    } else if (payload.direction === 'prev') {
      nextIndex -= 1;
    }

    nextIndex = Math.max(0, Math.min(total - 1, nextIndex));
    projectionState.currentSlideIndex = nextIndex;
    projectionState.active = true;

    // Si el operador cambia manualmente y estamos en "Solo letra", reiniciar el contador
    if (projectionState.audioMode === 'letra' && projectionState.advanceMode === 'auto') {
      startSoloLetraTimer();
    }

    io.emit('state:update', projectionState);
  });

  // Cambiar entre avance Automático y Manual en caliente
  socket.on('project:advance-mode', (payload = {}) => {
    const mode = payload.advanceMode === 'manual' ? 'manual' : 'auto';
    projectionState.advanceMode = mode;
    if (projectionState.audioMode === 'letra') {
      if (mode === 'auto') startSoloLetraTimer();
      else stopSoloLetraTimer();
    }
    io.emit('state:update', projectionState);
  });

  // Pausar / Reanudar reproducción
  socket.on('project:toggle-play', async () => {
    if (!projectionState.active) return;
    projectionState.isPlaying = !projectionState.isPlaying;
    if (projectionState.isPlaying) {
      await switchToHymnScene();
    }
    io.emit('audio:control', {
      action: projectionState.isPlaying ? 'play' : 'pause',
    });
    if (projectionState.audioMode === 'letra') {
      if (projectionState.isPlaying) startSoloLetraTimer();
      else stopSoloLetraTimer();
    }
    io.emit('state:update', projectionState);
  });

  // Saltar a un segundo específico del audio
  socket.on('audio:seek', (payload = {}) => {
    if (typeof payload.time === 'number') {
      projectionState.currentTime = payload.time;
      io.emit('audio:control', { action: 'seek', time: payload.time });
    }
  });

  // Detener proyección, limpiar pantalla y regresar a la escena previa en OBS
  socket.on('project:stop', async () => {
    stopHymnProjection();
    await restorePreviousScene();
  });

  // Actualización del progreso de audio enviada desde la vista de proyección (/proyeccion)
  socket.on('audio:timeupdate', (payload = {}) => {
    if (!projectionState.active || !projectionState.hymn) return;
    const currentTime = Number(payload.currentTime) || 0;
    const duration = Number(payload.duration) || 0;

    projectionState.currentTime = currentTime;
    if (duration > 0 && Math.abs(duration - projectionState.duration) > 0.5) {
      projectionState.duration = duration;
      projectionState.computedSchedule = buildSlideSchedule(
        projectionState.hymn,
        duration
      );
    }

    // Si el avance está en Automático, actualizar la diapositiva según la marca de tiempo
    if (
      projectionState.advanceMode === 'auto' &&
      projectionState.isPlaying &&
      projectionState.computedSchedule.length > 0
    ) {
      let targetIdx = 0;
      for (let i = 0; i < projectionState.computedSchedule.length; i++) {
        if (currentTime >= projectionState.computedSchedule[i]) {
          targetIdx = i;
        } else {
          break;
        }
      }
      if (targetIdx !== projectionState.currentSlideIndex) {
        projectionState.currentSlideIndex = targetIdx;
        io.emit('state:update', projectionState);
        return;
      }
    }

    // Emitir progreso ligero a los paneles
    socket.broadcast.emit('audio:progress', {
      currentTime: projectionState.currentTime,
      duration: projectionState.duration,
      currentSlideIndex: projectionState.currentSlideIndex,
      computedSchedule: projectionState.computedSchedule,
    });
  });

  socket.on('audio:ended', () => {
    stopSoloLetraTimer();
    projectionState.isPlaying = false;
    io.emit('state:update', projectionState);
  });

  // =========================================================
  // EVENTOS DE PROYECCIÓN DE BIBLIA
  // =========================================================

  // Proyectar un versículo y cambiar a la escena de Biblia seleccionada ("Biblia" o "Biblia Camara")
  socket.on('bible:project', async (payload = {}) => {
    const version = payload.version === 'DHH' ? 'DHH' : 'RVR1960';
    const sceneMode = payload.sceneMode === 'camara' ? 'camara' : 'fondo';
    const data = getBibleVerseData(
      version,
      payload.bookId || 'GEN',
      Number(payload.chapter) || 1,
      Number(payload.verse) || 1
    );
    if (!data) return;

    bibleState = {
      active: true,
      version: data.version,
      versionName: data.versionName,
      bookId: data.bookId,
      bookName: data.bookName,
      chapter: data.chapter,
      verse: data.verse,
      verseLabel: data.verseLabel,
      text: data.text,
      sceneMode,
    };

    if (projectionState.active || projectionState.isPlaying) {
      stopHymnProjection();
    }
    await switchToBibleScene(sceneMode);
    io.emit('bible:update', bibleState);
  });

  // Cambiar entre escena "Biblia" (fondo) y "Biblia Camara" en caliente
  socket.on('bible:scene-mode', async (payload = {}) => {
    const sceneMode = payload.sceneMode === 'camara' ? 'camara' : 'fondo';
    bibleState.sceneMode = sceneMode;
    if (bibleState.active) {
      await switchToBibleScene(sceneMode);
    }
    io.emit('bible:update', bibleState);
  });

  // Detener proyección de Biblia y regresar a la escena previa en OBS
  socket.on('bible:stop', async () => {
    bibleState = {
      ...bibleState,
      active: false,
    };
    await restorePreviousScene();
    io.emit('bible:update', bibleState);
  });
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`ℹ️ El servidor ya está activo en el puerto ${PORT}.`);
  } else {
    console.error('Error en el servidor HTTP:', err);
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`📖🎵 Biblia e Himnario OBS listo en http://localhost:${PORT}`);
  console.log(`   • Panel de Control (Dock OBS): http://localhost:${PORT}/panel`);
  console.log(`   • Fuente Navegador Himnario: http://localhost:${PORT}/proyeccion`);
  console.log(`   • Fuente Navegador Biblia:   http://localhost:${PORT}/biblia`);
  console.log(`   • Carpeta de Audios MP3:     ${obsConfig.audioRootDir || DEFAULT_USER_AUDIO_ROOT}`);
  console.log(`========================================================\n`);
});

module.exports = {
  app,
  server,
  PORT,
  obsConfig,
  openAudioFolderInOS,
  setAudioRootDir,
};
