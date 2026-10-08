import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type AppMode = 'notes' | 'memos'
type ThemeMode = 'dark' | 'light'
type Preferences = { home: AppMode; theme: ThemeMode }

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('topnote-preferences') || '{}')
    return {
      home: value.home === 'memos' ? 'memos' : 'notes',
      theme: value.theme === 'light' ? 'light' : 'dark',
    }
  } catch {
    return { home: 'notes', theme: 'dark' }
  }
}

function createNamedNote(): NamedNote {
  return { id: makeId(), title: '', content: '', updatedAt: new Date().toISOString() }
}

function emptyDailyNotes(date: string): DailyNotes {
  return { date, entries: [createNamedNote()] }
}

function dateLabel(date: string) {
  const today = localDate()
  const yesterday = new Date(`${today}T00:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)
  if (date === today) return '今天'
  if (date === yesterdayKey) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00`))
}

function formatTime(value?: string) {
  if (!value) return '等待输入'
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function Icon({ name }: { name: 'pin' | 'folder' | 'chevron' | 'note' | 'plus' | 'trash' | 'check' | 'settings' | 'fullscreen' | 'restore' }) {
  const paths = {
    pin: <><path d="M12 17v5" /><path d="M5 3h14l-3 6v4l2 2H6l2-2V9L5 3Z" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    note: <><path d="M5 3h10l4 4v14H5V3Z" /><path d="M15 3v5h4" /><path d="M8 13h8M8 17h6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-3v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.7a1.7 1.7 0 0 0-1.55-1H5v-3h.45A1.7 1.7 0 0 0 7 9.7a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.7 6a1.7 1.7 0 0 0 1-1.55V4h3v.45a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.7a1.7 1.7 0 0 0 1.55 1H21v3h-.05a1.7 1.7 0 0 0-1.55 1.3Z" /></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    restore: <><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /><path d="m4 9 5-5M20 9l-5-5M4 15l5 5M20 15l-5 5" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function MarkdownEditor({ value, onChange }: { value: string; onChange: (markdown: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!rootRef.current) return
    let disposed = false
    let created = false
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: value,
      features: {
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.TopBar]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: '写下一句话……输入 / 可以插入标题、列表、引用或代码块',
          mode: 'doc',
        },
      },
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown, previousMarkdown) => {
        if (!disposed && markdown !== previousMarkdown) onChangeRef.current(markdown)
      })
    })

    void crepe.create().then(() => {
      created = true
      if (disposed) void crepe.destroy()
    }).catch((error) => console.error('Markdown editor failed to start:', error))

    return () => {
      disposed = true
      if (created) void crepe.destroy()
    }
  }, [])

  return <div className="markdown-editor" ref={rootRef} />
}

function createMemo(group = '未分组'): Memo {
  return { id: makeId(), title: '', content: '', group, done: false, updatedAt: new Date().toISOString() }
}

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [windowState, setWindowState] = useState<WindowState>({ expanded: false, pinned: false, fullScreen: false })
  const [mode, setMode] = useState<AppMode>(() => loadPreferences().home)
  const [modeSwitching, setModeSwitching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeDate, setActiveDate] = useState(localDate)
  const [dailyNotes, setDailyNotes] = useState<DailyNotes>(() => emptyDailyNotes(localDate()))
  const [activeNoteId, setActiveNoteId] = useState(() => dailyNotes.entries[0].id)
  const [history, setHistory] = useState<NoteSummary[]>([])
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [memos, setMemos] = useState<Memo[]>([])
  const [memoGroups, setMemoGroups] = useState<string[]>(['工作', '学习', '生活', '未分组'])
  const [activeMemoGroup, setActiveMemoGroup] = useState('全部')
  const [groupComposerOpen, setGroupComposerOpen] = useState(false)
  const [groupDraft, setGroupDraft] = useState('')
  const [memoSaveState, setMemoSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [editorSession, setEditorSession] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const memoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dailyRef = useRef(dailyNotes)
  const memoRef = useRef(memos)
  const memoGroupsRef = useRef(memoGroups)
  const memosLoaded = useRef(false)
  const calendarDay = useRef(localDate())
  const titleInputRef = useRef<HTMLInputElement>(null)
  const modeSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modeSwitchFrame = useRef<number | null>(null)

  useEffect(() => { dailyRef.current = dailyNotes }, [dailyNotes])
  useEffect(() => { memoRef.current = memos }, [memos])
  useEffect(() => { memoGroupsRef.current = memoGroups }, [memoGroups])

  const activeNote = useMemo(
    () => dailyNotes.entries.find((entry) => entry.id === activeNoteId) || dailyNotes.entries[0],
    [activeNoteId, dailyNotes.entries],
  )

  const refreshHistory = useCallback(async () => setHistory(await window.topNote.listNotes()), [])

  const loadDate = useCallback(async (date: string) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await window.topNote.saveNote(dailyRef.current)
    }
    const loaded = await window.topNote.loadNote(date)
    const next = loaded && loaded.entries.length ? loaded : emptyDailyNotes(date)
    dailyRef.current = next
    setActiveDate(date)
    setDailyNotes(next)
    setActiveNoteId(next.entries[0].id)
    setEditorSession((value) => value + 1)
    setSaveState('saved')
  }, [])

  const saveNow = useCallback(async (value: DailyNotes) => {
    setSaveState('saving')
    try {
      const saved = await window.topNote.saveNote(value)
      if (dailyRef.current === value) {
        dailyRef.current = saved
        setDailyNotes(saved)
        setSaveState('saved')
      }
      await refreshHistory()
    } catch {
      setSaveState('error')
    }
  }, [refreshHistory])

  const saveMemosNow = useCallback(async (value: Memo[], groups = memoGroupsRef.current) => {
    setMemoSaveState('saving')
    try {
      const saved = await window.topNote.saveMemos({ memos: value, groups })
      if (memoRef.current === value) {
        memoRef.current = saved.memos
        memoGroupsRef.current = saved.groups
        setMemos(saved.memos)
        setMemoGroups(saved.groups)
      }
      setMemoSaveState('saved')
    } catch {
      setMemoSaveState('error')
    }
  }, [])

  useEffect(() => window.topNote.onWindowState(setWindowState), [])

  useEffect(() => {
    window.topNote.setMode(mode)
  }, [mode])

  useEffect(() => {
    window.topNote.setTheme(preferences.theme)
  }, [preferences.theme])

  useEffect(() => {
    if (!windowState.expanded && mode !== preferences.home) setMode(preferences.home)
  }, [mode, preferences.home, windowState.expanded])

  useEffect(() => {
    loadDate(localDate())
    refreshHistory()
    window.topNote.loadMemos().then((loaded) => {
      memoRef.current = loaded.memos
      memoGroupsRef.current = loaded.groups
      setMemos(loaded.memos)
      setMemoGroups(loaded.groups)
      memosLoaded.current = true
    }).catch(() => setMemoSaveState('error'))
  }, [loadDate, refreshHistory])

  useEffect(() => {
    const timer = setInterval(() => {
      const today = localDate()
      if (today !== calendarDay.current) {
        calendarDay.current = today
        saveNow(dailyRef.current).then(() => loadDate(today))
      }
    }, 30_000)
    return () => clearInterval(timer)
  }, [loadDate, saveNow])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current)
    if (modeSwitchTimer.current) clearTimeout(modeSwitchTimer.current)
    if (modeSwitchFrame.current !== null) cancelAnimationFrame(modeSwitchFrame.current)
    window.topNote.saveNote(dailyRef.current)
    if (memosLoaded.current) window.topNote.saveMemos({ memos: memoRef.current, groups: memoGroupsRef.current })
  }, [])

  const scheduleDailySave = (next: DailyNotes) => {
    dailyRef.current = next
    setDailyNotes(next)
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      saveNow(next)
    }, 450)
  }

  const updateActiveNote = (patch: Partial<NamedNote>) => {
    const now = new Date().toISOString()
    scheduleDailySave({
      ...dailyRef.current,
      entries: dailyRef.current.entries.map((entry) => entry.id === activeNoteId ? { ...entry, ...patch, updatedAt: now } : entry),
    })
  }

  const addNamedNote = () => {
    const entry = createNamedNote()
    scheduleDailySave({ ...dailyRef.current, entries: [...dailyRef.current.entries, entry] })
    setActiveNoteId(entry.id)
    setEditorSession((value) => value + 1)
    requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const selectNamedNote = (id: string) => {
    if (id === activeNoteId) return
    setActiveNoteId(id)
    setEditorSession((value) => value + 1)
  }

  const commitMemos = (next: Memo[], nextGroups = memoGroupsRef.current) => {
    memoRef.current = next
    memoGroupsRef.current = nextGroups
    setMemos(next)
    setMemoGroups(nextGroups)
    setMemoSaveState('saving')
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current)
    memoSaveTimer.current = setTimeout(() => {
      memoSaveTimer.current = null
      saveMemosNow(next, nextGroups)
    }, 420)
  }

  const addMemo = () => commitMemos([createMemo(activeMemoGroup === '全部' ? '未分组' : activeMemoGroup), ...memoRef.current])
  const updateMemo = (id: string, patch: Partial<Memo>) => commitMemos(memoRef.current.map((memo) => memo.id === id ? { ...memo, ...patch, updatedAt: new Date().toISOString() } : memo))
  const removeMemo = (id: string) => commitMemos(memoRef.current.filter((memo) => memo.id !== id))

  const addMemoGroup = () => {
    const name = groupDraft.trim().slice(0, 40)
    if (!name || name === '全部') return
    const nextGroups = memoGroupsRef.current.includes(name) ? memoGroupsRef.current : [...memoGroupsRef.current, name]
    commitMemos(memoRef.current, nextGroups)
    setActiveMemoGroup(name)
    setGroupDraft('')
    setGroupComposerOpen(false)
  }

  const removeActiveMemoGroup = () => {
    if (['全部', '工作', '学习', '生活', '未分组'].includes(activeMemoGroup)) return
    const nextMemos = memoRef.current.map((memo) => memo.group === activeMemoGroup ? { ...memo, group: '未分组', updatedAt: new Date().toISOString() } : memo)
    const nextGroups = memoGroupsRef.current.filter((group) => group !== activeMemoGroup)
    commitMemos(nextMemos, nextGroups)
    setActiveMemoGroup('全部')
  }

  const wordCount = activeNote?.content.trim() ? activeNote.content.trim().length : 0
  const today = localDate()
  const visibleMemos = activeMemoGroup === '全部' ? memos : memos.filter((memo) => memo.group === activeMemoGroup)

  const switchMode = (nextMode: AppMode) => {
    setSettingsOpen(false)
    if (nextMode === mode || modeSwitching) return
    setModeSwitching(true)
    modeSwitchTimer.current = setTimeout(() => {
      setMode(nextMode)
      modeSwitchTimer.current = null
      modeSwitchFrame.current = requestAnimationFrame(() => {
        setModeSwitching(false)
        modeSwitchFrame.current = null
      })
    }, 80)
  }

  const updatePreferences = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    localStorage.setItem('topnote-preferences', JSON.stringify(next))
  }

  const namedNoteList = (
    <div className="daily-note-list">
      <div className="daily-note-label"><span>当天笔记</span><small>{dailyNotes.entries.length}</small></div>
      {dailyNotes.entries.map((entry) => (
        <button key={entry.id} className={entry.id === activeNoteId ? 'named-note selected' : 'named-note'} onClick={() => selectNamedNote(entry.id)}>
          <span>{entry.title || '未命名笔记'}</span>
          <small>{entry.content.replace(/\s+/g, ' ').slice(0, 24) || '空白内容'}</small>
        </button>
      ))}
      <button className="add-note-button" onClick={addNamedNote}><Icon name="plus" />新建笔记</button>
    </div>
  )

  return (
    <main className={`${windowState.expanded ? 'app expanded' : 'app collapsed'}${windowState.fullScreen ? ' fullscreen' : ''} theme-${preferences.theme}`}>
      <div className="edge-handle"><span /></div>
      <section className="panel" aria-hidden={!windowState.expanded}>
        <header className="titlebar">
          <div className="brand"><div className="brand-mark"><Icon name="note" /></div><div><strong>顶部笔记</strong><span>把灵感留在今天</span></div></div>
          <nav className="mode-switch" aria-label="功能模式">
            <button className={mode === 'notes' ? 'active' : ''} onClick={() => switchMode('notes')}>学习笔记{preferences.home === 'notes' && <i title="默认首页" />}</button>
            <button className={mode === 'memos' ? 'active' : ''} onClick={() => switchMode('memos')}>备忘录{preferences.home === 'memos' && <i title="默认首页" />}</button>
          </nav>
          <div className="window-actions">
            <button className={settingsOpen ? 'icon-button active' : 'icon-button'} title="偏好设置" onClick={() => setSettingsOpen((value) => !value)}><Icon name="settings" /></button>
            <button className="icon-button" title={windowState.fullScreen ? '退出全屏' : '全屏'} onClick={() => window.topNote.toggleFullScreen()}><Icon name={windowState.fullScreen ? 'restore' : 'fullscreen'} /></button>
            <button className={windowState.pinned ? 'icon-button active' : 'icon-button'} title="固定窗口" onClick={() => window.topNote.setPinned(!windowState.pinned)}><Icon name="pin" /></button>
            <button className="icon-button" title="收起" onClick={() => window.topNote.collapse()}><Icon name="chevron" /></button>
          </div>
        </header>

        {settingsOpen && (
          <aside className="preferences-popover">
            <div className="preference-group">
              <strong>悬停后显示</strong>
              <div className="segmented-control">
                <button className={preferences.home === 'notes' ? 'active' : ''} onClick={() => updatePreferences({ home: 'notes' })}>学习笔记</button>
                <button className={preferences.home === 'memos' ? 'active' : ''} onClick={() => updatePreferences({ home: 'memos' })}>备忘录</button>
              </div>
            </div>
            <div className="preference-group">
              <strong>界面主题</strong>
              <div className="segmented-control theme-control">
                <button className={preferences.theme === 'dark' ? 'active' : ''} onClick={() => updatePreferences({ theme: 'dark' })}><span className="theme-dot dark" />暗色</button>
                <button className={preferences.theme === 'light' ? 'active' : ''} onClick={() => updatePreferences({ theme: 'light' })}><span className="theme-dot light" />白色</button>
              </div>
            </div>
            <details className="editing-guide">
              <summary>学习笔记编辑教学</summary>
              <div className="guide-content">
                <section>
                  <strong>基本编辑</strong>
                  <p>点击正文直接输入，画面就是最终排版。输入 <kbd>/</kbd> 可打开插入菜单，用方向键选择标题、列表、引用、代码块等内容。</p>
                </section>
                <section>
                  <strong>快速创建格式</strong>
                  <dl>
                    <div><dt><kbd>#</kbd> + 空格</dt><dd>一级标题；使用 ##、### 可创建更小标题</dd></div>
                    <div><dt><kbd>-</kbd> + 空格</dt><dd>无序列表</dd></div>
                    <div><dt><kbd>1.</kbd> + 空格</dt><dd>有序列表</dd></div>
                    <div><dt><kbd>- [ ]</kbd> + 空格</dt><dd>待办事项</dd></div>
                    <div><dt><kbd>&gt;</kbd> + 空格</dt><dd>引用段落</dd></div>
                    <div><dt><kbd>```</kbd></dt><dd>代码块</dd></div>
                    <div><dt><kbd>---</kbd></dt><dd>分隔线</dd></div>
                  </dl>
                </section>
                <section>
                  <strong>文字与快捷键</strong>
                  <p>选中文字后可使用浮动工具栏调整样式。常用快捷键：<kbd>Ctrl+B</kbd> 加粗、<kbd>Ctrl+I</kbd> 斜体、<kbd>Ctrl+K</kbd> 添加链接、<kbd>Ctrl+Z</kbd> 撤销、<kbd>Ctrl+Y</kbd> 重做。</p>
                </section>
                <section>
                  <strong>保存与 Markdown</strong>
                  <p>停止输入片刻后自动保存。标题和正文都能直接编辑；内容以 Markdown 保存，重新打开时仍以所见即所得方式呈现。</p>
                </section>
              </div>
            </details>
            <p className="preference-note">设置会自动记住，下次悬停直接进入所选首页。</p>
          </aside>
        )}

        <div className={modeSwitching ? 'mode-stage switching' : 'mode-stage'}>
        {mode === 'notes' ? (
          <div className="workspace">
            <aside className={historyOpen ? 'history open' : 'history'}>
              <div className="history-heading"><span>记忆</span><button className="tiny-button" onClick={() => setHistoryOpen(false)}>隐藏</button></div>
              <button className={activeDate === today ? 'day-card selected today' : 'day-card today'} onClick={() => loadDate(today)}>
                <span className="day-dot" /><span><strong>今天</strong><small>{today}</small></span>
              </button>
              {activeDate === today && namedNoteList}
              <div className="history-list">
                {history.filter((item) => item.date !== today).map((item) => (
                  <div className="history-day" key={item.date}>
                    <button className={activeDate === item.date ? 'day-card selected' : 'day-card'} onClick={() => loadDate(item.date)}>
                      <span><strong>{dateLabel(item.date)}</strong><small>{item.entries?.length || 1} 篇 · {item.title || item.preview || '空白笔记'}</small></span>
                    </button>
                    {activeDate === item.date && namedNoteList}
                  </div>
                ))}
                {history.filter((item) => item.date !== today).length === 0 && activeDate === today && <p className="empty-history">从今天开始，<br />时间会替你收好每一页。</p>}
              </div>
              <button className="folder-button" onClick={() => window.topNote.openDataFolder()}><Icon name="folder" />打开备份目录</button>
            </aside>

            <article className="note-editor">
              <div className="editor-meta">
                {!historyOpen && <button className="history-toggle" onClick={() => setHistoryOpen(true)}>记忆</button>}
                <span>{dateLabel(activeDate)} · {activeDate}</span>
                <span className={`save-state ${saveState}`}><i />{saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败' : `已保存 ${formatTime(activeNote?.updatedAt || dailyNotes.updatedAt)}`}</span>
              </div>
              <input ref={titleInputRef} className="note-title" value={activeNote?.title || ''} onChange={(event) => updateActiveNote({ title: event.target.value })} placeholder="给这篇笔记命名" aria-label="笔记标题" />
              {activeNote && <MarkdownEditor key={`${activeDate}:${activeNote.id}:${editorSession}`} value={activeNote.content} onChange={(content) => updateActiveNote({ content })} />}
              <footer className="editor-footer"><span>{wordCount} 字 · 当天第 {dailyNotes.entries.findIndex((entry) => entry.id === activeNoteId) + 1} 篇</span><span>滚轮查看全部 · 代码块可横向滚动</span></footer>
            </article>
          </div>
        ) : (
          <section className="memo-workspace">
            <aside className="memo-sidebar">
              <div className="memo-sidebar-title"><span>备忘录</span><small>{memos.length}</small></div>
              <nav className="memo-group-list" aria-label="备忘录分组">
                {['全部', ...memoGroups].map((group, index) => (
                  <button type="button" key={group} className={`${activeMemoGroup === group ? 'memo-group active' : 'memo-group'} tone-${index % 5}`} onClick={() => setActiveMemoGroup(group)}>
                    <i /><span>{group}</span><small>{group === '全部' ? memos.length : memos.filter((memo) => memo.group === group).length}</small>
                  </button>
                ))}
              </nav>
              <div className="memo-sidebar-footer">
                {groupComposerOpen ? (
                  <form className="group-composer" onSubmit={(event) => { event.preventDefault(); addMemoGroup() }}>
                    <input autoFocus value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setGroupComposerOpen(false); setGroupDraft('') } }} placeholder="新分组名称" maxLength={40} />
                    <button type="submit">添加</button>
                  </form>
                ) : <button type="button" className="add-group-button" onClick={() => setGroupComposerOpen(true)}><Icon name="plus" />新建分组</button>}
              </div>
            </aside>

            <div className="memo-content">
              <header className="memo-header">
                <div><span className="eyebrow">MEMO · {activeMemoGroup === '全部' ? 'ALL' : activeMemoGroup}</span><h1>{activeMemoGroup === '全部' ? '全部备忘' : activeMemoGroup}</h1><p>{visibleMemos.filter((memo) => !memo.done).length} 条待处理 · {visibleMemos.length} 条记录</p></div>
                <div className="memo-header-actions">
                  <span className={`save-state ${memoSaveState}`}><i />{memoSaveState === 'saving' ? '保存中' : memoSaveState === 'error' ? '保存失败' : '已保存'}</span>
                  {!['全部', '工作', '学习', '生活', '未分组'].includes(activeMemoGroup) && <button type="button" className="delete-group-button" onClick={removeActiveMemoGroup} title="删除当前分组，组内备忘将移至未分组">删除组</button>}
                  <button className="new-memo-button" onClick={addMemo}><Icon name="plus" /><span>新建</span></button>
                </div>
              </header>
              <div className="memo-grid">
                {visibleMemos.map((memo) => {
                  const tone = (memoGroups.indexOf(memo.group) + 1) % 5
                  return (
                    <article className={`${memo.done ? 'memo-card done' : 'memo-card'} tone-${tone}`} key={memo.id}>
                      <div className="memo-card-top">
                        <i className="memo-card-accent" />
                        <input value={memo.title} onChange={(event) => updateMemo(memo.id, { title: event.target.value })} placeholder="备忘标题" aria-label="备忘标题" />
                        <button className="memo-delete" title="删除备忘录" onClick={() => removeMemo(memo.id)}><Icon name="trash" /></button>
                      </div>
                      <textarea value={memo.content} onChange={(event) => updateMemo(memo.id, { content: event.target.value })} placeholder="记下一件不能忘记的事……" aria-label="备忘内容" />
                      <footer className="memo-card-footer">
                        <button className="memo-check" title={memo.done ? '标为未完成' : '标为完成'} onClick={() => updateMemo(memo.id, { done: !memo.done })}>{memo.done && <Icon name="check" />}</button>
                        <select aria-label="备忘分组" value={memo.group} onChange={(event) => updateMemo(memo.id, { group: event.target.value })}>{memoGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
                        <time>{formatTime(memo.updatedAt)}</time>
                      </footer>
                    </article>
                  )
                })}
                {visibleMemos.length === 0 && <button className="memo-empty" onClick={addMemo}><span><Icon name="plus" /></span><strong>{memos.length ? `在“${activeMemoGroup}”中新建备忘` : '写下第一条备忘'}</strong><small>标题、正文与分组都会自动保存</small></button>}
              </div>
            </div>
          </section>
        )}
        </div>
      </section>
    </main>
  )
}
