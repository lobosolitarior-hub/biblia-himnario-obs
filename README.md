# 📖🎵 Biblia e Himnario Adventista para OBS Studio

Sistema de control y proyección en directo para **OBS Studio** pensado para iglesias adventistas. Incluye:
- **🎵 Nuevo Himnario Adventista completo (614 himnos):** letra sincronizada con avance automático o manual, soporte para pistas locales (**Cantado**, **Instrumental** o **Solo letra**) y cambio automático a la escena `Himnario` en OBS.
- **📖 Santa Biblia integrada (100% sin internet):** versiones **Reina Valera 1960 (RVR1960)** y **Dios Habla Hoy (DHH)** completas (66 libros), buscador inteligente de citas (`Génesis 3:20`, `Éxodo 20:8`, etc.), vista completa del capítulo para cambiar de versículo con un clic y selector entre **2 escenas de OBS** (`🖼️ Fondo` y `🎥 Cámara`).

---

## 📥 1. Instalación rápida (Windows y Mac)

1. Ve a la sección **[Releases](../../releases)** de este repositorio en GitHub.
2. Descarga el instalador para tu sistema:
   - **Windows:** `Biblia e Himnario OBS Setup 1.0.2.exe` (o la versión portable).
   - **Mac (macOS):** `Biblia e Himnario OBS-1.0.2-arm64.dmg`.
3. Abre el programa. Quedará activo en la **bandeja del sistema** (junto al reloj en Windows o en la barra superior en Mac) y se iniciará automáticamente al encender la computadora.

---

## 🎵 2. Cómo agregar los archivos MP3 del Himnario

El instalador no incluye los archivos MP3 para mantenerse ligero. Al abrir el programa por primera vez, se crea automáticamente en tus **Documentos** la carpeta:

- `Documentos/Biblia e Himnario OBS/Cantado` → Copia aquí los MP3 cantados (`001.mp3`, `001 - Titulo.mp3`, etc.).
- `Documentos/Biblia e Himnario OBS/Instrumental` → Copia aquí los MP3 instrumentales.

> 💡 **Tip:** Puedes hacer clic en el icono del programa en la barra de tareas y elegir **"📂 Abrir carpeta para copiar MP3"** (o elegir cualquier otra carpeta donde ya tengas tus pistas guardadas).

---

## 🎥 3. Configuración en OBS Studio (en 3 minutos)

### Paso A: Habilitar OBS WebSocket (para cambio automático de escenas)
1. En OBS Studio ve al menú superior: **Herramientas → Ajustes del servidor WebSocket**.
2. Marca la casilla **"Habilitar servidor WebSocket"** (puerto `4455`).
3. Si usas contraseña, haz clic sobre el título **`📖🎵 Biblia e Himnario`** dentro del panel para pegarla y darle a **Guardar y Conectar** (el punto indicador se pondrá en **verde**).

### Paso B: Agregar el Panel de Control dentro de OBS
1. En OBS ve a **Paneles (Docks) → Paneles de navegador personalizados...**
2. Agrega un nuevo panel:
   - **Nombre del panel:** `Biblia e Himnario`
   - **URL:** `http://localhost:3000/panel`
3. Haz clic en **Aplicar** y acóplalo en tu interfaz de OBS.

### Paso C: Agregar las Fuentes de Navegador en tus Escenas
1. **Escena `Himnario`:**
   - Crea una escena llamada **`Himnario`**.
   - Agrega una fuente de **Navegador (Browser Source)** con URL: `http://localhost:3000/proyeccion` (`1920` × `1080`).
2. **Escenas de Biblia (`Biblia` y `Biblia Camara`):**
   - Crea tus escenas **`Biblia`** (con tu imagen o video de fondo) y **`Biblia Camara`** (con la cámara del predicador).
   - En ambas escenas agrega una fuente de **Navegador (Browser Source)** con URL: `http://localhost:3000/biblia` (`1920` × `1080`). Como tiene fondo transparente, puedes acomodarla donde prefieras.

---

## 💻 Desarrollo desde el código fuente (Node.js)

Si deseas modificar el código fuente o ejecutarlo con Node.js:

```bash
# Instalar dependencias
npm install

# Ejecutar solo el servidor web (http://localhost:3000)
npm start

# Ejecutar la aplicación de bandeja con Electron
npm run app

# Generar instaladores en la carpeta dist/
npm run dist:mac   # Instalador .dmg para macOS
npm run dist:win   # Instalador .exe para Windows
```

---

## 👨‍💻 Autor y Agradecimientos

Este sistema fue diseñado y desarrollado por:

- **Ing. Rubén Humberto Armendáriz Tamayo**
- *Ingeniero en Sistemas Computacionales*

> 🙏 **¿Ha sido de bendición este proyecto para tu iglesia?**
> Este software se comparte de manera totalmente gratuita para apoyar el ministerio de comunicación y transmisión de las congregaciones. Si deseas agradecer o compartir desde qué iglesia lo están utilizando, puedes:
> - ⭐ Dejar una **estrella (Star)** arriba a la derecha en este repositorio de GitHub.
> - ✉️ Enviar un mensaje de saludo a: **[lobosolitarior@gmail.com](mailto:lobosolitarior@gmail.com)**

