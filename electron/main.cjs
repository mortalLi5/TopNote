const { app, BrowserWindow, ipcMain, screen, shell, globalShortcut, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DEFAULT_WINDOW_SIZE = { width: 800, height: 520 }
const MEMO_WINDOW_SIZE = { width: 660, height: 450 }
const MIN_WINDOW_SIZE = { width: 640, height: 420 }
const MAX_WINDOW_SIZE = { width: 1200, height: 850 }
const WINDOW_STATE_VERSION = 4
const TRIGGER_HALF_WIDTH = 70
const TRIGGER_HEIGHT = 14
const HOVER_DWELL_MS = 110
const DEFAULT_MEMO_GROUPS = ['工作', '学习', '生活', '未分组']

let mainWindow
let expanded = false
let pinned = false
let topSince = 0
let transitionToken = 0
let edgeTimer
let anchorDisplayId = null
let windowSize = { ...DEFAULT_WINDOW_SIZE }
let activeWindowMode = 'notes'
let resizeSaveTimer
let boundsAnimationTimer
let boundsAnimationToken = 0
let isAnimatingBounds = false
let fullScreenActive = false
let fullScreenDisplayId = null
let fullScreenRestoreSize = null
let suppressBlurUntil = 0
let suppressResizeUntil = 0

function notesDirectory() {
  return path.join(app.getPath('documents'), '顶部笔记', 'notes')
}

function memosFilePath() {
  return path.join(path.dirname(notesDirectory()), 'memos.json')
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function boundedWindowSize(value = {}) {
  return {
    width: Math.min(MAX_WINDOW_SIZE.width, Math.max(MIN_WINDOW_SIZE.width, Number(value.width) || DEFAULT_WINDOW_SIZE.width)),
    height: Math.min(MAX_WINDOW_SIZE.height, Math.max(MIN_WINDOW_SIZE.height, Number(value.height) || DEFAULT_WINDOW_SIZE.height)),
  }
}

async function loadWindowSize() {
  try {
    const saved = JSON.parse(await fs.readFile(windowStatePath(), 'utf8'))
    if (saved.version === WINDOW_STATE_VERSION) {
      windowSize = boundedWindowSize(saved)
    } else {
      windowSize = { ...DEFAULT_WINDOW_SIZE }
      await saveWindowSize()
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to restore window size:', error)
  }
}

async function saveWindowSize() {
  await fs.mkdir(path.dirname(windowStatePath()), { recursive: true })
  await fs.writeFile(windowStatePath(), JSON.stringify({ version: WINDOW_STATE_VERSION, ...windowSize }, null, 2), 'utf8')
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function ensureNotesDirectory() {
  await fs.mkdir(notesDirectory(), { recursive: true })
}

function notePath(date) {
  if (!validDate(date)) throw new Error('无效的日期')
  return path.join(notesDirectory(), `${date}.json`)
}

async function loadNote(date) {
  await ensureNotesDirectory()
  try {
    const value = JSON.parse(await fs.readFile(notePath(date), 'utf8'))
    return normalizeDailyNotes(value, date)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function normalizeDailyNotes(value, fallbackDate) {
  const date = validDate(value?.date) ? value.date : fallbackDate
  if (!validDate(date)) throw new Error('笔记数据无效')
  const sourceEntries = Array.isArray(value?.entries)
    ? value.entries
    : [{ id: 'primary', title: value?.title, content: value?.content, updatedAt: value?.updatedAt }]
  const entries = sourceEntries.slice(0, 200).map((entry, index) => ({
    id: String(entry?.id || `${date}-${index}`).slice(0, 100),
    title: String(entry?.title || '').slice(0, 160),
    content: String(entry?.content || ''),
    updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : '',
  }))
  return {
    date,
    entries,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '',
  }
}

async function saveNote(note) {
  if (!note || !validDate(note.date)) throw new Error('笔记数据无效')
  await ensureNotesDirectory()
  const now = new Date().toISOString()
  const normalized = normalizeDailyNotes(note, note.date)
  const safeNote = { ...normalized, updatedAt: now, entries: normalized.entries.map((entry) => ({ ...entry, updatedAt: entry.updatedAt || now })) }
  const target = notePath(safeNote.date)
  const temporary = `${target}.${process.pid}.tmp`
  await fs.writeFile(temporary, JSON.stringify(safeNote, null, 2), 'utf8')
  try {
    await fs.rename(temporary, target)
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error
    await fs.rm(target, { force: true })
    await fs.rename(temporary, target)
  }
  return safeNote
}

async function listNotes() {
  await ensureNotesDirectory()
  const files = (await fs.readdir(notesDirectory())).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  const notes = await Promise.all(files.map(async (name) => {
    try {
      const rawNote = JSON.parse(await fs.readFile(path.join(notesDirectory(), name), 'utf8'))
      const note = normalizeDailyNotes(rawNote, name.slice(0, 10))
      const first = note.entries[0]
      return {
        date: note.date,
        title: first?.title || `${note.entries.length || 1} 篇笔记`,
        preview: String(first?.content || '').replace(/\s+/g, ' ').slice(0, 48),
        updatedAt: note.updatedAt || '',
        entries: note.entries.map((entry) => ({
          id: entry.id,
          title: entry.title || '未命名笔记',
          preview: entry.content.replace(/\s+/g, ' ').slice(0, 36),
        })),
      }
    } catch {
      return null
    }
  }))
  return notes.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))
}

async function loadMemos() {
  await ensureNotesDirectory()
  try {
    const value = JSON.parse(await fs.readFile(memosFilePath(), 'utf8'))
    return normalizeMemoStore(value)
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeMemoStore({})
    throw error
  }
}

function normalizeMemoStore(value) {
  const sourceMemos = Array.isArray(value) ? value : Array.isArray(value?.memos) ? value.memos : []
  const savedGroups = Array.isArray(value?.groups) ? value.groups : []
  const memos = sourceMemos.slice(0, 500).map((memo, index) => ({
    id: String(memo?.id || `${Date.now()}-${index}`).slice(0, 100),
    title: String(memo?.title || '').slice(0, 160),
    content: String(memo?.content || '').slice(0, 100_000),
    group: String(memo?.group || '未分组').trim().slice(0, 40) || '未分组',
    done: Boolean(memo?.done),
    updatedAt: typeof memo?.updatedAt === 'string' ? memo.updatedAt : new Date().toISOString(),
  }))
  const groups = [...new Set([
    ...DEFAULT_MEMO_GROUPS,
    ...savedGroups.map((group) => String(group || '').trim().slice(0, 40)).filter(Boolean),
    ...memos.map((memo) => memo.group),
  ])].slice(0, 50)
  return { groups, memos }
}

async function saveMemos(store) {
  await ensureNotesDirectory()
  const safeStore = normalizeMemoStore(store)
  const target = memosFilePath()
  const temporary = `${target}.${process.pid}.tmp`
  await fs.writeFile(temporary, JSON.stringify(safeStore, null, 2), 'utf8')
  try {
    await fs.rename(temporary, target)
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error
    await fs.rm(target, { force: true })
    await fs.rename(temporary, target)
  }
  return safeStore
}

function anchoredDisplay() {
  const displays = screen.getAllDisplays()
  return displays.find((display) => display.id === anchorDisplayId)
    || screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function targetBounds(size, display = anchoredDisplay()) {
  const area = display.workArea
  const fitted = {
    width: Math.min(size.width, area.width - 16),
    height: Math.min(size.height, area.height - 16),
  }
  const x = Math.round(area.x + (area.width - fitted.width) / 2)
  return { x, y: display.bounds.y, width: fitted.width, height: fitted.height }
}

function activeWindowSize() {
  return activeWindowMode === 'memos' ? MEMO_WINDOW_SIZE : windowSize
}

function centeredResizeBounds(size) {
  const current = mainWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
  const area = display.workArea
  const width = Math.min(size.width, area.width - 16)
  const height = Math.min(size.height, area.height - 16)
  const x = Math.min(area.x + area.width - width, Math.max(area.x, Math.round(current.x + (current.width - width) / 2)))
  const y = Math.min(area.y + area.height - height, Math.max(area.y, current.y))
  return { x, y, width, height }
}

function stopBoundsAnimation() {
  boundsAnimationToken += 1
  clearTimeout(boundsAnimationTimer)
  boundsAnimationTimer = null
  isAnimatingBounds = false
}

function animateWindowSize(size, duration = 190) {
  if (!mainWindow || mainWindow.isDestroyed() || fullScreenActive || mainWindow.isFullScreen()) return
  stopBoundsAnimation()
  const token = boundsAnimationToken
  const start = mainWindow.getBounds()
  const target = centeredResizeBounds(size)
  const startedAt = Date.now()
  isAnimatingBounds = true

  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed() || token !== boundsAnimationToken || fullScreenActive || mainWindow.isFullScreen()) {
      isAnimatingBounds = false
      return
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    const next = Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [
      key,
      Math.round(start[key] + (target[key] - start[key]) * eased),
    ]))
    mainWindow.setBounds(next, false)
    if (progress < 1) {
      boundsAnimationTimer = setTimeout(tick, 16)
    } else {
      boundsAnimationTimer = null
      isAnimatingBounds = false
    }
  }

  tick()
}

function sendWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:state', { expanded, pinned, fullScreen: fullScreenActive || mainWindow.isFullScreen() })
  }
}

function toggleFullScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  stopBoundsAnimation()
  clearTimeout(resizeSaveTimer)
  suppressBlurUntil = Date.now() + 1200
  suppressResizeUntil = Date.now() + 1600
  if (fullScreenActive || mainWindow.isFullScreen()) {
    fullScreenActive = false
    mainWindow.setFullScreen(false)
  } else {
    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    fullScreenDisplayId = display.id
    fullScreenRestoreSize = { width: bounds.width, height: bounds.height }
    anchorDisplayId = display.id
    fullScreenActive = true
    // Windows otherwise applies the normal window's size cap to fullscreen,
    // leaving a capped-width window at the display's left edge.
    mainWindow.setMaximumSize(0, 0)
    mainWindow.setFullScreen(true)
  }
  sendWindowState()
}

function expandWindow() {
  if (!mainWindow) return
  stopBoundsAnimation()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (expanded) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  transitionToken += 1
  anchorDisplayId = display.id
  mainWindow.setBounds(targetBounds(activeWindowSize(), display), false)
  expanded = true
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.setFocusable(true)
  mainWindow.show()
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && expanded) mainWindow.focus()
  }, 180)
  sendWindowState()
}

function collapseWindow() {
  if (!mainWindow || !expanded || pinned) return
  stopBoundsAnimation()
  if (fullScreenActive || mainWindow.isFullScreen()) {
    fullScreenActive = false
    suppressBlurUntil = Date.now() + 800
    suppressResizeUntil = Date.now() + 1200
    mainWindow.setFullScreen(false)
  }
  const token = ++transitionToken
  expanded = false
  topSince = 0
  sendWindowState()
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || expanded || token !== transitionToken) return
    mainWindow.setBounds(targetBounds(activeWindowSize()), false)
    mainWindow.setFocusable(false)
    mainWindow.setIgnoreMouseEvents(true)
  }, 230)
}

function watchTopEdge() {
  edgeTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || expanded) return
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const centerX = display.workArea.x + display.workArea.width / 2
    const overTrigger = cursor.x >= centerX - TRIGGER_HALF_WIDTH
      && cursor.x <= centerX + TRIGGER_HALF_WIDTH
      && cursor.y >= display.bounds.y
      && cursor.y <= display.bounds.y + TRIGGER_HEIGHT
    if (!overTrigger) {
      topSince = 0
      return
    }
    if (anchorDisplayId !== display.id) {
      anchorDisplayId = display.id
      mainWindow.setBounds(targetBounds(activeWindowSize(), display), false)
    }
    if (!topSince) topSince = Date.now()
    if (Date.now() - topSince >= HOVER_DWELL_MS) expandWindow()
  }, 50)
}

function createWindow() {
  const initialBounds = targetBounds(windowSize)
  mainWindow = new BrowserWindow({
    ...initialBounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    thickFrame: true,
    roundedCorners: true,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    maxWidth: MAX_WINDOW_SIZE.width,
    maxHeight: MAX_WINDOW_SIZE.height,
    movable: true,
    maximizable: false,
    fullscreenable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
  mainWindow.setIgnoreMouseEvents(true)

  if (process.argv.includes('--dev')) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.showInactive())
  mainWindow.webContents.once('did-finish-load', sendWindowState)
  mainWindow.on('enter-full-screen', () => {
    fullScreenActive = true
    sendWindowState()
  })
  mainWindow.on('leave-full-screen', () => {
    fullScreenActive = false
    suppressBlurUntil = Date.now() + 800
    suppressResizeUntil = Date.now() + 1200
    sendWindowState()
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !fullScreenActive && !mainWindow.isFullScreen()) {
        mainWindow.setMaximumSize(MAX_WINDOW_SIZE.width, MAX_WINDOW_SIZE.height)
        const display = screen.getAllDisplays().find((item) => item.id === fullScreenDisplayId) || anchoredDisplay()
        const restoreSize = fullScreenRestoreSize || activeWindowSize()
        mainWindow.setBounds(targetBounds(restoreSize, display), false)
        if (activeWindowMode === 'notes') windowSize = boundedWindowSize(restoreSize)
        fullScreenRestoreSize = null
        if (expanded) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    }, 90)
  })
  mainWindow.on('resize', () => {
    if (!expanded || activeWindowMode !== 'notes' || fullScreenActive || mainWindow.isFullScreen() || isAnimatingBounds || Date.now() < suppressResizeUntil) return
    clearTimeout(resizeSaveTimer)
    resizeSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !expanded || fullScreenActive || mainWindow.isFullScreen() || Date.now() < suppressResizeUntil) return
      const bounds = mainWindow.getBounds()
      windowSize = boundedWindowSize(bounds)
      saveWindowSize().catch((error) => console.warn('Unable to save window size:', error))
    }, 280)
  })
  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (Date.now() < suppressBlurUntil) return
      if (expanded && !pinned && mainWindow && !mainWindow.isFocused()) collapseWindow()
    }, 36)
  })
}

app.whenReady().then(async () => {
  await ensureNotesDirectory()
  await loadWindowSize()
  createWindow()
  watchTopEdge()
  globalShortcut.register('CommandOrControl+Shift+N', expandWindow)
})

app.on('before-quit', () => {
  clearInterval(edgeTimer)
  clearTimeout(resizeSaveTimer)
  stopBoundsAnimation()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => app.quit())

ipcMain.handle('notes:load', (_event, date) => loadNote(date))
ipcMain.handle('notes:save', (_event, note) => saveNote(note))
ipcMain.handle('notes:list', () => listNotes())
ipcMain.handle('memos:load', () => loadMemos())
ipcMain.handle('memos:save', (_event, store) => saveMemos(store))
ipcMain.handle('app:open-data-folder', async () => {
  await ensureNotesDirectory()
  return shell.openPath(path.dirname(notesDirectory()))
})

ipcMain.on('window:set-pinned', (_event, value) => {
  pinned = Boolean(value)
  sendWindowState()
})
ipcMain.on('window:collapse', collapseWindow)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:toggle-fullscreen', () => {
  toggleFullScreen()
})
ipcMain.on('window:set-mode', (_event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const nextMode = mode === 'memos' ? 'memos' : 'notes'
  if (nextMode === activeWindowMode) return
  activeWindowMode = nextMode
  animateWindowSize(activeWindowSize())
})
ipcMain.on('window:set-theme', (_event, theme) => {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
})
