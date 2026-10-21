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

let tray = null;
let mainWindow = null;
let isQuitting = false;
let serverModule = null;

// Icono PNG 16x16 en base64 para la bandeja del sistema (Windows Tray / Mac Menu Bar)
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVQ4T2NkoBAwUqifYdQABgZGBgY2BgaG/0g8XAw2AJsB2AwgZiA2AzA14PIwNoMJsRkYGJ7jciM2A4g1gBjD8LkBn4H43IDNDcRmALGG4fIwIbaMAgB5hBMR73qN5AAAAABJRU5ErkJggg==';

function createTrayIcon() {
  const iconPath = path.join(__dirname, 'public', 'icon-tray.png');
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      return img.resize({ width: 18, height: 18 });
    }
  } catch {}
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
}

function openControlWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 340,
    minHeight: 480,
    title: 'Biblia e Himnario - Panel OBS (v1.0.1)',
    backgroundColor: '#181a20',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
