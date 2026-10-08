const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('topNote', {
  loadNote: (date) => ipcRenderer.invoke('notes:load', date),
  saveNote: (note) => ipcRenderer.invoke('notes:save', note),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  loadMemos: () => ipcRenderer.invoke('memos:load'),
  saveMemos: (memos) => ipcRenderer.invoke('memos:save', memos),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  setPinned: (pinned) => ipcRenderer.send('window:set-pinned', pinned),
  collapse: () => ipcRenderer.send('window:collapse'),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleFullScreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  setMode: (mode) => ipcRenderer.send('window:set-mode', mode),
  setTheme: (theme) => ipcRenderer.send('window:set-theme', theme),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  },
})
