import { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { BubbleSize, RecordingOptions, RecordingMeta, CropArea } from './types';
import { ShareServer } from './shareServer';

let preRecordingWindow: BrowserWindow | null = null;
let cameraBubbleWindow: BrowserWindow | null = null;
let controlBarWindow: BrowserWindow | null = null;
let drawingOverlayWindow: BrowserWindow | null = null;
let countdownWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let speakerNotesWindow: BrowserWindow | null = null;
let cropSelectorWindow: BrowserWindow | null = null;
let shareServer: ShareServer | null = null;

app.setName('LoomClone');
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'LoomClone'));
} catch (e) {}

// Disable Chromium flags that cause cache lock and WGC capturer failures on Windows
app.commandLine.appendSwitch('disable-features', 'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let isRecording = false;
let isPaused = false;
let currentOptions: RecordingOptions | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5174';

const RECORDINGS_DIR = path.join(app.getPath('videos'), 'LoomCloneRecordings');
const METADATA_FILE = path.join(RECORDINGS_DIR, 'recordings_metadata.json');

// Ensure recordings folder exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function loadView(window: BrowserWindow, view: string) {
  const distHtml = path.join(__dirname, '../dist/index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(`${process.env.VITE_DEV_SERVER_URL}/?view=${view}`);
  } else if (fs.existsSync(distHtml)) {
    window.loadFile(distHtml, {
      query: { view }
    });
  } else {
    window.loadURL(`${VITE_DEV_SERVER_URL}/?view=${view}`);
  }
}

// 1. Create Pre-Recording Launcher Window
function createPreRecordingWindow() {
  if (preRecordingWindow && !preRecordingWindow.isDestroyed()) {
    preRecordingWindow.show();
    preRecordingWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  preRecordingWindow = new BrowserWindow({
    width: 460,
    height: 700,
    x: Math.round(width - 500),
    y: Math.round(height - 740),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: path.join(__dirname, '../public/assets/application-icons/app-icon-tray.ico'),
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loadView(preRecordingWindow, 'pre-recording');

  preRecordingWindow.on('closed', () => {
    preRecordingWindow = null;
  });
}

// 2. Create Floating Camera Bubble Window
function createCameraBubbleWindow(size: BubbleSize = 'medium') {
  if (cameraBubbleWindow && !cameraBubbleWindow.isDestroyed()) {
    setBubbleSize(size);
    cameraBubbleWindow.show();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { height } = primaryDisplay.workAreaSize;

  const dim = getBubbleDimensions(size);

  cameraBubbleWindow = new BrowserWindow({
    width: dim.width,
    height: dim.height,
    x: 40,
    y: Math.round(height - dim.height - 40),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  cameraBubbleWindow.setAlwaysOnTop(true, 'screen-saver');
  loadView(cameraBubbleWindow, 'camera-bubble');

  cameraBubbleWindow.on('closed', () => {
    cameraBubbleWindow = null;
  });
}

function getBubbleDimensions(size: BubbleSize) {
  switch (size) {
    case 'small':
      return { width: 170, height: 170 };
    case 'medium':
      return { width: 250, height: 250 };
    case 'large':
      return { width: 340, height: 340 };
    case 'fullscreen': {
      const primary = screen.getPrimaryDisplay();
      return { width: primary.bounds.width, height: primary.bounds.height };
    }
  }
}

function setBubbleSize(size: BubbleSize) {
  if (!cameraBubbleWindow || cameraBubbleWindow.isDestroyed()) return;

  const dim = getBubbleDimensions(size);
  const bounds = cameraBubbleWindow.getBounds();

  if (size === 'fullscreen') {
    cameraBubbleWindow.setBounds({ x: 0, y: 0, width: dim.width, height: dim.height });
  } else {
    // Keep bottom-left anchor point
    const newY = bounds.y + (bounds.height - dim.height);
    cameraBubbleWindow.setBounds({
      x: bounds.x,
      y: Math.max(0, newY),
      width: dim.width,
      height: dim.height
    });
  }

  cameraBubbleWindow.webContents.send('bubble:size-changed', size);
}

// 3. Create Floating Control Bar Window
function createControlBarWindow() {
  if (controlBarWindow && !controlBarWindow.isDestroyed()) {
    controlBarWindow.show();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { height } = primaryDisplay.workAreaSize;

  controlBarWindow = new BrowserWindow({
    width: 320,
    height: 64,
    x: 320,
    y: Math.round(height - 100),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  controlBarWindow.setAlwaysOnTop(true, 'screen-saver');
  loadView(controlBarWindow, 'control-bar');

  controlBarWindow.on('closed', () => {
    controlBarWindow = null;
  });
}

// 4. Create Fullscreen Drawing Overlay Window
function createDrawingOverlayWindow() {
  if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  drawingOverlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  drawingOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  // Initially hidden / ignore mouse events until drawing is toggled
  drawingOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  loadView(drawingOverlayWindow, 'drawing-overlay');

  drawingOverlayWindow.on('closed', () => {
    drawingOverlayWindow = null;
  });
}

// 5. Create Countdown Window
function createCountdownWindow(onFinished: () => void) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  countdownWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  countdownWindow.setAlwaysOnTop(true, 'screen-saver');
  countdownWindow.setIgnoreMouseEvents(true);
  loadView(countdownWindow, 'countdown');

  let count = 3;
  broadcastSound('countdown');

  const interval = setInterval(() => {
    count--;
    if (countdownWindow && !countdownWindow.isDestroyed()) {
      countdownWindow.webContents.send('countdown:tick', count);
    }

    if (count > 0) {
      broadcastSound('countdown');
    } else {
      clearInterval(interval);
      setTimeout(() => {
        if (countdownWindow && !countdownWindow.isDestroyed()) {
          countdownWindow.close();
          countdownWindow = null;
        }
        onFinished();
      }, 500);
    }
  }, 1000);
}

// 6. Create Video Preview Window
function createPreviewWindow(meta: RecordingMeta) {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus();
    previewWindow.webContents.send('preview:open', meta);
    return;
  }

  previewWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    transparent: false,
    backgroundColor: '#111216',
    title: `Loom Clone - ${meta.title}`,
    icon: path.join(__dirname, '../public/assets/application-icons/app-icon-tray.ico'),
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loadView(previewWindow, 'preview');

  previewWindow.webContents.once('did-finish-load', () => {
    previewWindow?.webContents.send('preview:open', meta);
  });

  previewWindow.on('closed', () => {
    previewWindow = null;
  });
}

// 7. Toggle Speaker Notes / Teleprompter Window
function toggleSpeakerNotesWindow() {
  if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
    if (speakerNotesWindow.isVisible()) {
      speakerNotesWindow.hide();
    } else {
      speakerNotesWindow.show();
      speakerNotesWindow.focus();
    }
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  speakerNotesWindow = new BrowserWindow({
    width: 380,
    height: 480,
    x: Math.round(width / 2 - 190),
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  speakerNotesWindow.setAlwaysOnTop(true, 'screen-saver');
  loadView(speakerNotesWindow, 'speaker-notes');

  speakerNotesWindow.on('closed', () => {
    speakerNotesWindow = null;
  });
}

// 8. Create Crop Selection Overlay Window
function createCropSelectorWindow() {
  if (cropSelectorWindow && !cropSelectorWindow.isDestroyed()) {
    cropSelectorWindow.show();
    cropSelectorWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  cropSelectorWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  cropSelectorWindow.setAlwaysOnTop(true, 'screen-saver');
  loadView(cropSelectorWindow, 'crop-selector');

  cropSelectorWindow.on('closed', () => {
    cropSelectorWindow = null;
  });
}

// Helper: Broadcast sound to active windows
function broadcastSound(soundName: string) {
  const windows = [preRecordingWindow, cameraBubbleWindow, controlBarWindow, previewWindow];
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('sound:play-client', soundName);
    }
  });
}

// Helper: Broadcast state change
function broadcastState(state: string) {
  const windows = [preRecordingWindow, cameraBubbleWindow, controlBarWindow, drawingOverlayWindow];
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('recording:state-changed', state);
    }
  });
}

// Metadata persistence
function readMetadata(): RecordingMeta[] {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const data = fs.readFileSync(METADATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read metadata:', err);
  }
  return [];
}

function writeMetadata(list: RecordingMeta[]) {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write metadata:', err);
  }
}

// IPC Handlers
function setupIpcHandlers() {
  // Capture sources
  ipcMain.handle('capturer:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });

    return sources
      .filter((s) => !s.name.includes('Loom Clone') && !s.name.includes('Teleprompter') && s.name.trim() !== '')
      .map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        display_id: s.display_id,
        appIcon: s.appIcon?.toDataURL()
      }));
  });

  // Recording Lifecycle
  ipcMain.on('recording:start', (_, options: RecordingOptions) => {
    currentOptions = options;
    isRecording = true;
    isPaused = false;

    // Hide pre-recording window
    if (preRecordingWindow && !preRecordingWindow.isDestroyed()) {
      preRecordingWindow.hide();
    }

    // Launch countdown
    createCountdownWindow(() => {
      broadcastSound('start');
      broadcastState('recording');

      // Create camera bubble if mode is screen-cam, cam-only or custom-area
      if (options.mode === 'screen-cam' || options.mode === 'cam-only' || (options.mode === 'custom-area' && options.videoDeviceId)) {
        createCameraBubbleWindow(options.mode === 'cam-only' ? 'large' : 'medium');
        cameraBubbleWindow?.webContents.once('did-finish-load', () => {
          cameraBubbleWindow?.webContents.send('recording:options', options);
        });
      }

      // Open Speaker Notes if enabled
      if (options.speakerNotesEnabled) {
        toggleSpeakerNotesWindow();
      }

      // Create floating control bar
      createControlBarWindow();
      controlBarWindow?.webContents.once('did-finish-load', () => {
        controlBarWindow?.webContents.send('recording:options', options);
      });

      // Prepare drawing overlay in background
      createDrawingOverlayWindow();
    });
  });

  ipcMain.on('recording:stop', () => {
    isRecording = false;
    isPaused = false;
    broadcastSound('stop');
    broadcastState('stopped');

    // Notify camera bubble and control bar to stop MediaRecorder & send buffer
    cameraBubbleWindow?.webContents.send('recording:request-buffer');
    controlBarWindow?.webContents.send('recording:request-buffer');
    preRecordingWindow?.webContents.send('recording:request-buffer');
  });

  ipcMain.on('recording:pause', () => {
    isPaused = true;
    broadcastSound('pause');
    broadcastState('paused');
  });

  ipcMain.on('recording:resume', () => {
    isPaused = false;
    broadcastSound('start');
    broadcastState('recording');
  });

  ipcMain.on('recording:restart', () => {
    isPaused = false;
    broadcastSound('start');
    broadcastState('restart');
  });

  ipcMain.on('recording:cancel', () => {
    isRecording = false;
    isPaused = false;
    broadcastState('idle');

    if (cameraBubbleWindow && !cameraBubbleWindow.isDestroyed()) {
      cameraBubbleWindow.close();
    }
    if (controlBarWindow && !controlBarWindow.isDestroyed()) {
      controlBarWindow.close();
    }
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
      drawingOverlayWindow.close();
    }
    if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
      speakerNotesWindow.close();
    }

    if (preRecordingWindow && !preRecordingWindow.isDestroyed()) {
      preRecordingWindow.show();
    }
  });

  // Camera Bubble Size
  ipcMain.on('bubble:set-size', (_, size: BubbleSize) => {
    setBubbleSize(size);
  });

  // Drawing mode toggle
  let isDrawingActive = false;
  ipcMain.on('drawing:toggle', () => {
    isDrawingActive = !isDrawingActive;
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
      drawingOverlayWindow.setIgnoreMouseEvents(!isDrawingActive, { forward: true });
      drawingOverlayWindow.webContents.send('drawing:toggled', isDrawingActive);
    }
  });

  ipcMain.on('drawing:set-active', (_, active: boolean) => {
    isDrawingActive = active;
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
      drawingOverlayWindow.setIgnoreMouseEvents(!active, { forward: true });
      drawingOverlayWindow.webContents.send('drawing:toggled', active);
    }
  });

  ipcMain.on('drawing:clear', () => {
    drawingOverlayWindow?.webContents.send('drawing:clear-canvas');
  });

  // Sound trigger
  ipcMain.on('sound:play', (_, soundName: string) => {
    broadcastSound(soundName);
  });

  // Recording Storage
  ipcMain.handle('recordings:save', async (_, arrayBuffer: ArrayBuffer, meta: Omit<RecordingMeta, 'id' | 'filePath' | 'fileSize'>) => {
    const id = `rec_${Date.now()}`;
    const filename = `Loom_Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);

    const record: RecordingMeta = {
      ...meta,
      id,
      filePath,
      fileSize: buffer.length,
      shareUrl: shareServer ? shareServer.getShareUrl(id) : '',
      viewsCount: 0,
      comments: [],
      reactions: []
    };

    const currentList = readMetadata();
    currentList.unshift(record);
    writeMetadata(currentList);

    // Close floating recording elements
    if (cameraBubbleWindow && !cameraBubbleWindow.isDestroyed()) {
      cameraBubbleWindow.close();
    }
    if (controlBarWindow && !controlBarWindow.isDestroyed()) {
      controlBarWindow.close();
    }
    if (drawingOverlayWindow && !drawingOverlayWindow.isDestroyed()) {
      drawingOverlayWindow.close();
    }
    if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
      speakerNotesWindow.close();
    }

    // Play complete sound and open preview
    broadcastSound('complete');
    createPreviewWindow(record);

    return record;
  });

  ipcMain.handle('recordings:get-share-url', async (_, id: string) => {
    return shareServer ? shareServer.getShareUrl(id) : '';
  });

  ipcMain.on('window:open-external', (_, url: string) => {
    if (url) shell.openExternal(url);
  });

  ipcMain.on('speaker-notes:toggle', () => {
    toggleSpeakerNotesWindow();
  });

  ipcMain.on('crop:start-selection', () => {
    createCropSelectorWindow();
  });

  ipcMain.on('crop:area-selected', (_, area: CropArea) => {
    if (cropSelectorWindow && !cropSelectorWindow.isDestroyed()) {
      cropSelectorWindow.close();
      cropSelectorWindow = null;
    }
    if (preRecordingWindow && !preRecordingWindow.isDestroyed()) {
      preRecordingWindow.webContents.send('crop:area-selected', area);
      preRecordingWindow.show();
      preRecordingWindow.focus();
    }
  });

  ipcMain.handle('recordings:list', async () => {
    return readMetadata();
  });

  ipcMain.handle('recordings:delete', async (_, id: string) => {
    const list = readMetadata();
    const target = list.find((r) => r.id === id);
    if (target && fs.existsSync(target.filePath)) {
      try {
        await fs.promises.unlink(target.filePath);
      } catch (err) {
        console.error('Error deleting video file:', err);
      }
    }
    const updated = list.filter((r) => r.id !== id);
    writeMetadata(updated);
    return true;
  });

  ipcMain.on('recordings:open-folder', (_, filePath: string) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(RECORDINGS_DIR);
    }
  });

  // Window helper actions
  ipcMain.on('window:close-current', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.on('window:minimize-current', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
}

// App lifecycle
app.whenReady().then(() => {
  shareServer = new ShareServer(readMetadata, writeMetadata);
  shareServer.start();

  setupIpcHandlers();

  // Register Global Shortcuts
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (isRecording) {
      ipcMain.emit('recording:stop');
    } else if (preRecordingWindow) {
      preRecordingWindow.show();
      preRecordingWindow.focus();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (isRecording) {
      if (isPaused) {
        ipcMain.emit('recording:resume');
      } else {
        ipcMain.emit('recording:pause');
      }
    }
  });

  createPreRecordingWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPreRecordingWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
