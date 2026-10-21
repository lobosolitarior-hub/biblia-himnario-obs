/**
 * ============================================================================
 *  SISTEMA: Biblia e Himnario Adventista para OBS Studio (Aplicación Tray)
 *  AUTOR:   Ing. Rubén Humberto Armendáriz Tamayo
 *  TÍTULO:  Ingeniero en Sistemas Computacionales
 *  GITHUB:  https://github.com/lobosolitarior-hub/biblia-himnario-obs
 * ============================================================================
 */

const { app, BrowserWindow, Tray, Menu, shell, clipboard, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Evitar que se abran dos instancias al mismo tiempo
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Identificador de modelo de usuario para que Windows muestre el ícono en la barra de tareas
if (process.platform === 'win32') {
  app.setAppUserModelId('org.adventista.bibliahimnarioobs');
}

let tray = null;
let mainWindow = null;
let isQuitting = false;
let serverModule = null;

// Icono PNG 32x32 en base64 (Biblia abierta + nota musical dorada) para respaldo garantizado
const TRAY_ICON_BASE64 =
  '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';

function createAppIcon() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, 'public', 'icon.ico'),
          path.join(__dirname, 'public', 'icon.png'),
          path.join(__dirname, 'public', 'icon-tray.png'),
        ]
      : [
          path.join(__dirname, 'public', 'icon.png'),
          path.join(__dirname, 'public', 'icon-tray.png'),
        ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const img = nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          return img;
        }
      }
    } catch {}
  }
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
}

function createTrayIcon() {
  const baseImg = createAppIcon();
  const targetSize = process.platform === 'darwin' ? 18 : 16;
  try {
    return baseImg.resize({ width: targetSize, height: targetSize });
  } catch {
    return baseImg;
  }
}

function openControlWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const appIcon = createAppIcon();

  mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 340,
    minHeight: 480,
    title: 'Biblia e Himnario - Panel OBS (v1.0.1)',
    icon: appIcon,
    backgroundColor: '#181a20',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.platform === 'win32' && mainWindow.setIcon) {
    try {
      mainWindow.setIcon(appIcon);
    } catch {}
  }

  const port = (serverModule && serverModule.PORT) || 3000;
  mainWindow.loadURL(`http://localhost:${port}/panel`);

  // Al cerrar la ventana, solo ocultarla para que el servidor siga corriendo en segundo plano para OBS
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }
}

async function pickCustomAudioFolder() {
  const result = await dialog.showOpenDialog({
    title: 'Selecciona la carpeta que contiene las subcarpetas Cantado e Instrumental',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (!result.canceled && result.filePaths && result.filePaths[0]) {
    const chosen = result.filePaths[0];
    if (serverModule && typeof serverModule.setAudioRootDir === 'function') {
      serverModule.setAudioRootDir(chosen);
      rebuildTrayMenu();
    }
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const port = (serverModule && serverModule.PORT) || 3000;
  const loginSettings = app.getLoginItemSettings();
  const autoStartEnabled = Boolean(loginSettings.openAtLogin);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `🟢 Biblia e Himnario OBS v1.0.1 (Puerto ${port})`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '🖥️ Abrir ventana del Panel de Control',
      click: () => openControlWindow(),
    },
    { type: 'separator' },
    {
      label: '📂 Abrir carpeta para copiar MP3 (Cantado / Instrumental)',
      click: () => {
        if (serverModule && typeof serverModule.openAudioFolderInOS === 'function') {
          serverModule.openAudioFolderInOS();
        }
      },
    },
    {
      label: '📁 Elegir otra carpeta donde tengas tus MP3...',
      click: () => pickCustomAudioFolder(),
    },
    { type: 'separator' },
    {
      label: '📋 Copiar enlaces (URLs) para OBS Studio',
      submenu: [
        {
          label: `Panel de Control (Dock): http://localhost:${port}/panel`,
          click: () => clipboard.writeText(`http://localhost:${port}/panel`),
        },
        {
          label: `Escena Himnario: http://localhost:${port}/proyeccion`,
          click: () => clipboard.writeText(`http://localhost:${port}/proyeccion`),
        },
        {
          label: `Escena Biblia: http://localhost:${port}/biblia`,
          click: () => clipboard.writeText(`http://localhost:${port}/biblia`),
        },
      ],
    },
    {
      label: '🚀 Iniciar automáticamente al encender Windows / Mac',
      type: 'checkbox',
      checked: autoStartEnabled,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
        });
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '👨‍💻 Autor: Ing. Rubén H. Armendáriz Tamayo (Agradecimientos)',
      click: () => shell.openExternal(`http://localhost:${port}/autor`),
    },
    ...(process.platform === 'win32'
      ? [
          { type: 'separator' },
          {
            label: '🗑️ Desinstalar Biblia e Himnario OBS...',
            click: () => {
              const choice = dialog.showMessageBoxSync({
                type: 'warning',
                buttons: ['Cancelar', 'Sí, desinstalar'],
                defaultId: 0,
                cancelId: 0,
                title: 'Desinstalar Biblia e Himnario OBS',
                message: '¿Deseas cerrar y desinstalar Biblia e Himnario OBS?',
                detail: 'Tus carpetas de pistas MP3 (Cantado / Instrumental) en Documentos NO se borrarán.',
              });
              if (choice === 1) {
                try {
                  app.setLoginItemSettings({ openAtLogin: false });
                  const installDir = path.dirname(process.execPath);
                  const uninstallerPath = path.join(installDir, 'Uninstall Biblia e Himnario OBS.exe');
                  if (fs.existsSync(uninstallerPath)) {
                    const child = spawn(uninstallerPath, [], {
                      detached: true,
                      stdio: 'ignore',
                    });
                    child.unref();
                  } else {
                    shell.openExternal('ms-settings:appsfeatures');
                  }
                } catch {}
                isQuitting = true;
                if (tray) tray.destroy();
                app.exit(0);
              }
            },
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: '❌ Detener servidor y salir',
      click: () => {
        isQuitting = true;
        if (tray) tray.destroy();
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip('Biblia e Himnario OBS - Servidor Activo');
  tray.setContextMenu(contextMenu);
}

app.on('second-instance', () => {
  openControlWindow();
});

app.whenReady().then(() => {
  // Configurar rutas escribibles para usuario e iniciar servidor Express + Socket.IO
  process.env.APP_USER_DATA_DIR = app.getPath('userData');
  process.env.APP_DOCUMENTS_DIR = app.getPath('documents');

  serverModule = require('./server.js');

  // Activar auto-arranque solo la primera vez que se instala, respetando si el usuario lo desactiva después
  if (app.isPackaged) {
    const autoStartFlagFile = path.join(app.getPath('userData'), 'autostart-initialized.json');
    if (!fs.existsSync(autoStartFlagFile) && !process.env.SKIP_DEFAULT_AUTOSTART) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
      });
      try {
        fs.writeFileSync(autoStartFlagFile, JSON.stringify({ initialized: true }), 'utf8');
      } catch {}
    }
  }

  // En macOS, ocultar del Dock al iniciar en segundo plano (solo vive en la barra superior)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  tray = new Tray(createTrayIcon());
  tray.on('double-click', () => openControlWindow());
  rebuildTrayMenu();
});

app.on('window-all-closed', (e) => {
  // No cerrar la aplicación al cerrar la ventana: sigue corriendo en la bandeja para OBS
  e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});
