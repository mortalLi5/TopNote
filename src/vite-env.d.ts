/// <reference types="vite/client" />

type NamedNote = {
  id: string
  title: string
  content: string
  updatedAt?: string
}

type DailyNotes = {
  date: string
  entries: NamedNote[]
  updatedAt?: string
}

type NoteSummary = {
  date: string
  title: string
  preview: string
  updatedAt: string
  entries?: Array<{
    id: string
    title: string
    preview: string
  }>
}

type WindowState = {
  expanded: boolean
  pinned: boolean
  fullScreen: boolean
}

type Memo = {
  id: string
  title: string
  content: string
  group: string
  done: boolean
  updatedAt: string
}

type MemoStore = {
  groups: string[]
  memos: Memo[]
}

interface Window {
  topNote: {
    loadNote: (date: string) => Promise<DailyNotes | null>
    saveNote: (note: DailyNotes) => Promise<DailyNotes>
    listNotes: () => Promise<NoteSummary[]>
    loadMemos: () => Promise<MemoStore>
    saveMemos: (store: MemoStore) => Promise<MemoStore>
    openDataFolder: () => Promise<string>
    setPinned: (pinned: boolean) => void
    collapse: () => void
    minimize: () => void
    toggleFullScreen: () => void
    setMode: (mode: 'notes' | 'memos') => void
    setTheme: (theme: 'dark' | 'light') => void
    onWindowState: (callback: (state: WindowState) => void) => () => void
  }
}
