'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Character, Story, Storybook, StorybookCharacter, SynopsisOption, CompanionSuggestion } from '@/types'
import { STYLES } from '@/lib/styles'
import { showToast } from '@/components/toast'

const AGE_OPTIONS: { value: '2-4' | '4-6' | '6-8'; label: string; emoji: string }[] = [
  { value: '2-4', label: '2-4岁', emoji: '🍼' },
  { value: '4-6', label: '4-6岁', emoji: '⭐' },
  { value: '6-8', label: '6-8岁', emoji: '🚀' },
]

const SYNOPSIS_STYLE = {
  A: { label: '感官体验型', gradient: 'from-rose-400 to-orange-400', bg: 'bg-rose-50', border: 'border-rose-200', ring: 'ring-rose-300' },
  B: { label: '情感互动型', gradient: 'from-violet-400 to-purple-400', bg: 'bg-violet-50', border: 'border-violet-200', ring: 'ring-violet-300' },
  C: { label: '勇气冒险型', gradient: 'from-emerald-400 to-teal-400', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-300' },
}

const VIDEO_SCENE_RANGE_OPTIONS = [
  { id: '3-4', min: 3, max: 4, eta: '预计制作 3-5 分钟' },
  { id: '7-10', min: 7, max: 10, eta: '预计制作 6-10 分钟' },
  { id: '15-18', min: 15, max: 18, eta: '预计制作 12-18 分钟' },
] as const
type VideoSceneRangeOptionId = (typeof VIDEO_SCENE_RANGE_OPTIONS)[number]['id']


export default function CreateStoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="skeleton h-64 w-96 rounded-3xl" /></div>}>
      <CreateStoryWizard />
    </Suspense>
  )
}

function CreateStoryWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Main step ─────────────────────────────────────────────
  const [step, setStep] = useState(0)

  // ── Step 0 — Book selection / new book creation ──────────
  const [storybooks, setStorybooks] = useState<Storybook[]>([])
  const [selectedStorybookId, setSelectedStorybookId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [bookSubStep, setBookSubStep] = useState(0) // 0=protagonist 1=style 2=companions 3=name+age
  const [loadingBooks, setLoadingBooks] = useState(true)
  const [savingBook, setSavingBook] = useState(false)

  // New book creation states
  const [newProtagonistId, setNewProtagonistId] = useState<string | null>(null)
  const [newBookStyleId, setNewBookStyleId] = useState(STYLES[0].id)
  const [selectedCompanionNames, setSelectedCompanionNames] = useState<string[]>([])
  const [customCompanion, setCustomCompanion] = useState('')
  const [newBookName, setNewBookName] = useState('')
  const [newBookAge, setNewBookAge] = useState<'2-4' | '4-6' | '6-8'>('4-6')
  const [companionSuggestions, setCompanionSuggestions] = useState<CompanionSuggestion[]>([])
  const [loadingCompanions, setLoadingCompanions] = useState(false)

  // All characters
  const [allCharacters, setAllCharacters] = useState<Character[]>([])

  // ── Step 1 — Episode creation ("灵感种子") ───────────────
  const [keywords, setKeywords] = useState('')
  const [episodeAge, setEpisodeAge] = useState<'2-4' | '4-6' | '6-8'>('4-6')
  const [isRecording, setIsRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [synopsisOptions, setSynopsisOptions] = useState<SynopsisOption[]>([])
  const [generatingSynopsis, setGeneratingSynopsis] = useState(false)

  // ── Step 2 — Story generation ────────────────────────────
  const [generatingStory, setGeneratingStory] = useState(false)
  const [generatedStoryId, setGeneratedStoryId] = useState<string | null>(null)
  const [generatedTitle, setGeneratedTitle] = useState('')
  const [generatedCoverImage, setGeneratedCoverImage] = useState('')
  const [generatedStoryContent, setGeneratedStoryContent] = useState('')
  const [selectedSynopsisOpt, setSelectedSynopsisOpt] = useState<SynopsisOption | null>(null)
  const [startingVideo, setStartingVideo] = useState(false)
  const [videoSceneRange, setVideoSceneRange] = useState<VideoSceneRangeOptionId>('15-18')

  // ── Initial data load ────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setLoadingBooks(true)
      try {
        const [booksRes, charsRes] = await Promise.all([
          fetch('/api/storybook'),
          fetch('/api/character'),
        ])
        if (booksRes.ok) {
          const d = await booksRes.json()
          const books: Storybook[] = d.storybooks ?? []
          setStorybooks(books)
          if (books.length === 0) {
            setCreatingNew(true)
          } else {
            setSelectedStorybookId(books[0].id)
          }
        }
        if (charsRes.ok) {
          const d = await charsRes.json()
          setAllCharacters(d.characters ?? [])
        }
      } finally {
        setLoadingBooks(false)
      }
    }
    fetchData()
  }, [])

  // Sync episodeAge when selecting existing book
  useEffect(() => {
    const book = storybooks.find((b) => b.id === selectedStorybookId)
    if (book) setEpisodeAge(book.ageRange as '2-4' | '4-6' | '6-8')
  }, [selectedStorybookId, storybooks])

  // Pre-fill keywords from ?hint= query param (e.g. from 命运抉择 choices)
  useEffect(() => {
    const hint = searchParams.get('hint')
    if (hint) setKeywords(hint)
  }, [searchParams])

  // ── Derived ──────────────────────────────────────────────
  const currentBook = storybooks.find((b) => b.id === selectedStorybookId)
  const newProtagonist = allCharacters.find((c) => c.id === newProtagonistId)

  // Book's protagonist (for existing books)
  const bookProtagonistId = currentBook?.characters.find((c) => c.role === 'protagonist')?.id
  const bookProtagonist = allCharacters.find((c) => c.id === bookProtagonistId)
  const bookProtagonistImage = bookProtagonist
    ? (bookProtagonist.styleImages?.[currentBook?.styleId ?? ''] ?? bookProtagonist.cartoonImage)
    : null

  // ── Step 0: New book creation helpers ────────────────────

  const fetchCompanions = useCallback(async (protagonistId: string) => {
    setLoadingCompanions(true)
    setCompanionSuggestions([])
    try {
      const res = await fetch('/api/companions/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protagonistId, backgroundKeywords: '奇幻冒险' }),
      })
      if (res.ok) {
        const data = await res.json()
        setCompanionSuggestions(data.companions ?? [])
      }
    } catch {
      // companions are optional
    } finally {
      setLoadingCompanions(false)
    }
  }, [])

  const toggleCompanion = (name: string) => {
    setSelectedCompanionNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleCreateNewBook = async () => {
    if (!newBookName.trim()) { showToast('请输入故事书名称', 'error'); return }
    if (!newProtagonistId) { showToast('请选择主角', 'error'); return }
    setSavingBook(true)
    try {
      const allCompanions = [...selectedCompanionNames]
      if (customCompanion.trim()) allCompanions.push(customCompanion.trim())

      const characters: StorybookCharacter[] = [
        { id: newProtagonistId, role: 'protagonist' },
        ...allCompanions.map((name) => ({ id: '', name, role: 'supporting' as const })),
      ]
      const res = await fetch('/api/storybook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBookName.trim(),
          ageRange: newBookAge,
          styleId: newBookStyleId,
          characters,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const newBook: Storybook = data.storybook
      setStorybooks((prev) => [newBook, ...prev])
      setSelectedStorybookId(newBook.id)
      setCreatingNew(false)
      setEpisodeAge(newBookAge)
      setStep(1)
    } catch {
      showToast('创建故事书失败，请重试', 'error')
    } finally {
      setSavingBook(false)
    }
  }

  // ── Step 1: Episode creation helpers ─────────────────────

  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        audioChunksRef.current = []
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          setTranscribing(true)
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
            const form = new FormData()
            form.append('audio', blob, 'recording.webm')
            form.append('hint', '故事背景关键词')
            const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
            if (res.ok) {
              const data = await res.json()
              if (data.transcript) setKeywords((prev) => prev ? `${prev}，${data.transcript}` : data.transcript)
            }
          } catch {
            showToast('语音转换失败', 'error')
          } finally {
            setTranscribing(false)
          }
        }
        recorder.start()
        mediaRecorderRef.current = recorder
        setIsRecording(true)
      } catch {
        showToast('无法访问麦克风，请检查权限', 'error')
      }
    }
  }

  const handleGenerateSynopsis = async () => {
    if (!keywords.trim()) { showToast('请输入灵感关键词', 'error'); return }
    setGeneratingSynopsis(true)
    setSynopsisOptions([])
    try {
      const res = await fetch(`/api/storybook/${selectedStorybookId}/synopsis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundKeywords: keywords.trim(),
          ageRange: episodeAge,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSynopsisOptions(data.options ?? [])
    } catch {
      showToast('梗概生成失败，请重试', 'error')
    } finally {
      setGeneratingSynopsis(false)
    }
  }

  const handleSelectSynopsis = async (synopsis: SynopsisOption) => {
    setStep(2)
    setGeneratingStory(true)
    setSelectedSynopsisOpt(synopsis)
    const title = synopsis.title || currentBook?.name || '我的故事'
    setGeneratedTitle(title)
    setGeneratedCoverImage('')
    try {
      const res = await fetch(`/api/storybook/${selectedStorybookId}/story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyName: title,
          selectedSynopsis: synopsis.content,
          synopsisVersion: synopsis.version,
          ageRange: episodeAge,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGeneratedStoryId(data.story.id)
      setGeneratedTitle(data.story.title)
      if (data.story.mainImage) setGeneratedCoverImage(data.story.mainImage)
      setGeneratedStoryContent(
        (data.story.content as string ?? '').replace(/<!--CHOICES:[\s\S]*?-->/g, '').trim()
      )
      // Append new chapter to storybooks so the chapter list in step 2 is up-to-date
      setStorybooks((prev) =>
        prev.map((b) =>
          b.id !== selectedStorybookId
            ? b
            : { ...b, chapters: [...(b.chapters ?? []), data.story as Story] }
        )
      )
    } catch {
      showToast('故事生成失败，请重试', 'error')
      setStep(1)
    } finally {
      setGeneratingStory(false)
    }
  }

  // ── Start video production pipeline ──────────────────────
  const handleStartVideo = useCallback(async () => {
    if (!generatedStoryId || startingVideo) return
    const selectedRange =
      VIDEO_SCENE_RANGE_OPTIONS.find((option) => option.id === videoSceneRange) ??
      VIDEO_SCENE_RANGE_OPTIONS[2]
    const minLength = selectedRange.min
    const maxLength = selectedRange.max

    setStartingVideo(true)
    try {
      // Step 1: generate director storyboard script from story
      const scriptRes = await fetch('/api/story/director-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: generatedStoryId,
          minLength,
          maxLength,
        }),
      })
      if (!scriptRes.ok) throw new Error('Script generation failed')
      const { script } = await scriptRes.json()

      // Step 2: kick off video pipeline
      const videoRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, storyId: generatedStoryId }),
      })
      if (!videoRes.ok) throw new Error('Video start failed')

      // Navigate to play page — polling will pick up the video project
      router.push(`/story/play?id=${generatedStoryId}`)
    } catch {
      showToast('视频启动失败，请重试', 'error')
      setStartingVideo(false)
    }
  }, [generatedStoryId, router, startingVideo, videoSceneRange])

  // ── Render ────────────────────────────────────────────────

  // Episode creation step labels (steps 1 & 2)
  const EPISODE_STEPS = ['灵感种子', '生成故事', '完成']

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 pt-6 pb-16">
      <div className={`mx-auto ${step === 1 ? 'max-w-3xl' : 'max-w-2xl'}`}>

        {/* Top nav: only show home link on step 0 */}
        {step === 0 && (
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-forest-500 hover:text-forest-700 mb-5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </Link>
        )}

        {/* Episode creation step indicator (steps 1 & 2) */}
        {(step === 1 || step === 2) && (
          <div className="flex items-center gap-1 mb-6">
            {EPISODE_STEPS.map((label, i) => {
              // 0=灵感种子 1=生成故事 2=完成
              const activeIndicator = step === 1 ? 0 : generatingStory ? 1 : 2
              const isDone = activeIndicator > i
              const isActive = activeIndicator === i
              return (
                <div key={i} className="flex items-center gap-1 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all ${
                    isActive ? 'bg-forest-500 border-forest-500 text-white' :
                    isDone   ? 'bg-forest-100 border-forest-300 text-forest-600' :
                               'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] font-bold hidden sm:block ${isActive ? 'text-forest-700' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {i < EPISODE_STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ STEP 0: 选择 / 创建故事书 ══ */}
        {step === 0 && (
          <div className="page-enter">
            {loadingBooks ? (
              <div className="space-y-3">
                <div className="skeleton h-14 rounded-2xl" />
                <div className="skeleton h-64 rounded-2xl" />
              </div>
            ) : creatingNew ? (
              <NewBookSubFlow
                bookSubStep={bookSubStep}
                setBookSubStep={setBookSubStep}
                allCharacters={allCharacters}
                newProtagonistId={newProtagonistId}
                setNewProtagonistId={setNewProtagonistId}
                newProtagonist={newProtagonist}
                newBookStyleId={newBookStyleId}
                setNewBookStyleId={setNewBookStyleId}
                selectedCompanionNames={selectedCompanionNames}
                toggleCompanion={toggleCompanion}
                customCompanion={customCompanion}
                setCustomCompanion={setCustomCompanion}
                companionSuggestions={companionSuggestions}
                loadingCompanions={loadingCompanions}
                fetchCompanions={fetchCompanions}
                newBookName={newBookName}
                setNewBookName={setNewBookName}
                newBookAge={newBookAge}
                setNewBookAge={setNewBookAge}
                savingBook={savingBook}
                handleCreateNewBook={handleCreateNewBook}
                onCancel={storybooks.length > 0 ? () => setCreatingNew(false) : undefined}
              />
            ) : (
              <ExistingBookSelection
                storybooks={storybooks}
                allCharacters={allCharacters}
                selectedStorybookId={selectedStorybookId}
                setSelectedStorybookId={setSelectedStorybookId}
                bookProtagonist={bookProtagonist ?? null}
                bookProtagonistImage={bookProtagonistImage}
                currentBook={currentBook ?? null}
                onCreateNew={() => { setCreatingNew(true); setBookSubStep(0) }}
                onNext={() => {
                  if (!selectedStorybookId) { showToast('请选择一本故事书', 'error'); return }
                  setStep(1)
                }}
              />
            )}
          </div>
        )}

        {/* ══ STEP 1: 灵感种子 ══ */}
        {step === 1 && (
          <div className="page-enter">
            {/* Book context mini-header */}
            {currentBook && (
              <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white/80 rounded-2xl border border-forest-100 shadow-sm">
                {bookProtagonistImage && (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-forest-100 shrink-0">
                    <Image src={bookProtagonistImage} alt={bookProtagonist?.name ?? ''} width={40} height={40} className="object-cover w-full h-full" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-extrabold text-forest-800 text-sm truncate">{currentBook.name}</p>
                  <p className="text-[10px] text-gray-400">{STYLES.find(s => s.id === currentBook.styleId)?.emoji} {STYLES.find(s => s.id === currentBook.styleId)?.label} · {currentBook.ageRange}岁</p>
                </div>
                <button onClick={() => setStep(0)} className="ml-auto text-xs text-forest-500 font-bold hover:text-forest-700 shrink-0">切换</button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[5fr_7fr] gap-4">
              {/* ── Left panel ── */}
              <div className="flex flex-col gap-4">
                <div className="card">
                  <h2 className="text-base font-extrabold text-forest-800 mb-1">灵感种子 ✨</h2>
                  <p className="text-xs text-gray-400 mb-4">输入关键词，AI 生成三版故事梗概</p>

                  {/* Keywords + mic */}
                  <div className="mb-3">
                    <label className="block text-xs font-bold text-forest-600 mb-1">背景关键词 *</label>
                    <div className="flex gap-2">
                      <textarea
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder="例如：星空、魔法书、会说话的猫、友谊"
                        className="input text-sm flex-1 resize-none"
                        rows={2}
                      />
                      <button
                        type="button"
                        onClick={handleMicClick}
                        disabled={transcribing}
                        className={`w-11 h-11 mt-0.5 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 ${
                          isRecording ? 'border-red-500 bg-red-500 text-white animate-pulse' :
                          transcribing ? 'border-gray-200 bg-gray-100 text-gray-400' :
                          'border-forest-300 bg-forest-50 text-forest-600 hover:bg-forest-100'
                        }`}
                        title={isRecording ? '点击停止录音' : '点击语音输入'}
                      >
                        {transcribing ? (
                          <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm6.25 7.5a.75.75 0 0 1 .743.648l.007.102A6.5 6.5 0 0 1 12.5 17.45V20h2.25a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5H11.5v-2.55A6.5 6.5 0 0 1 5 11.25a.75.75 0 0 1 1.5 0 5 5 0 0 0 10 0 .75.75 0 0 1 .75-.75z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {isRecording && (
                      <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        正在录音，点击麦克风停止...
                      </p>
                    )}
                  </div>

                  {/* Age range */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-forest-600 mb-1.5">小读者年龄</label>
                    <div className="flex gap-2">
                      {AGE_OPTIONS.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => setEpisodeAge(a.value)}
                          className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                            episodeAge === a.value
                              ? 'border-forest-500 bg-forest-100 text-forest-700'
                              : 'border-gray-200 text-gray-500 hover:border-forest-200'
                          }`}
                        >
                          {a.emoji} {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateSynopsis}
                    disabled={generatingSynopsis || !keywords.trim()}
                    className="btn-primary w-full disabled:opacity-50 text-sm"
                  >
                    {generatingSynopsis ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        AI 正在生成梗概...
                      </span>
                    ) : '生成三版梗概 ✨'}
                  </button>
                </div>
              </div>

              {/* ── Right panel ── */}
              <div className="flex flex-col gap-3">
                {!generatingSynopsis && synopsisOptions.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] rounded-2xl border-2 border-dashed border-gray-200 text-center p-6">
                    <div className="text-4xl mb-3 opacity-40">📖</div>
                    <p className="text-sm text-gray-400 font-medium">在左侧输入关键词</p>
                    <p className="text-xs text-gray-300 mt-1">点击「生成三版梗概」后，<br />三个故事版本将显示在这里</p>
                  </div>
                )}

                {generatingSynopsis && (
                  <div className="space-y-3">
                    {['A', 'B', 'C'].map((v) => (
                      <div key={v} className="rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
                        <div className="h-9 bg-gray-200 rounded-t-2xl" />
                        <div className="p-4 space-y-2">
                          <div className="h-3 bg-gray-100 rounded w-3/4" />
                          <div className="h-3 bg-gray-100 rounded w-full" />
                          <div className="h-3 bg-gray-100 rounded w-5/6" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!generatingSynopsis && synopsisOptions.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-gray-500 px-1">点击选择一版梗概，立即生成故事 →</p>
                    {synopsisOptions.map((opt) => {
                      const style = SYNOPSIS_STYLE[opt.version]
                      return (
                        <button
                          key={opt.version}
                          onClick={() => handleSelectSynopsis(opt)}
                          className="w-full text-left rounded-2xl border-2 border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-md transition-all active:scale-[0.99]"
                        >
                          <div className={`bg-gradient-to-r ${style.gradient} px-4 py-2.5 flex items-center gap-2`}>
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/30 text-white">
                              版本 {opt.version}
                            </span>
                            <span className="text-xs font-bold text-white/90">{style.label}</span>
                            <svg className="w-3.5 h-3.5 text-white/70 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="bg-white px-4 py-3">
                            {opt.title && (
                              <p className="font-extrabold text-gray-800 mb-1.5 text-sm">{opt.title}</p>
                            )}
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{opt.content}</p>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2: 生成中 / 完成 ══ */}
        {step === 2 && (
          <div className="page-enter">
            {generatingStory ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-forest-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-forest-500 border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-2xl">📖</div>
                </div>
                <h2 className="text-xl font-extrabold text-forest-800 mb-2">AI 正在编织故事...</h2>
                <p className="text-sm text-gray-400 mb-1">同时生成专属封面插画</p>
                <p className="text-xs text-gray-300">正在为「{generatedTitle}」创作中，请稍候</p>
              </div>
            ) : generatedStoryId ? (
              <>
                {/* Story preview card — HTML1 style */}
                <div className="flex flex-col sm:flex-row rounded-2xl bg-white shadow-xl border-2 border-forest-50/80 overflow-hidden mb-5">
                  {/* Cover image */}
                  {generatedCoverImage ? (
                    <div
                      className="w-full sm:w-2/5 aspect-[16/10] sm:aspect-auto bg-cover bg-center shrink-0 min-h-[180px]"
                      style={{ backgroundImage: `url(${generatedCoverImage})` }}
                    />
                  ) : (
                    <div className="w-full sm:w-2/5 aspect-[16/10] sm:aspect-auto min-h-[180px] bg-gradient-to-br from-forest-100 to-forest-200 flex items-center justify-center shrink-0">
                      <span className="text-5xl opacity-40">📖</span>
                    </div>
                  )}

                  {/* Story info */}
                  <div className="flex flex-col p-5 gap-3 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-forest-900 text-lg font-extrabold leading-tight">{generatedTitle}</h3>
                      <div className="shrink-0 w-8 h-8 rounded-full bg-forest-50 border border-forest-100 flex items-center justify-center text-forest-500 text-xs">✓</div>
                    </div>

                    {selectedSynopsisOpt && (
                      <p className="text-gray-500 text-xs leading-relaxed italic line-clamp-2">
                        &ldquo;{selectedSynopsisOpt.title}&rdquo;
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {selectedSynopsisOpt && (
                        <span className="px-2.5 py-1 bg-forest-50 border border-forest-200 rounded-full text-[10px] font-bold text-forest-600">
                          {selectedSynopsisOpt.label}
                        </span>
                      )}
                      {currentBook && (
                        <span className="px-2.5 py-1 bg-forest-50 border border-forest-200 rounded-full text-[10px] font-bold text-forest-600">
                          {currentBook.ageRange} 岁适读
                        </span>
                      )}
                      {bookProtagonist && (
                        <span className="px-2.5 py-1 bg-forest-50 border border-forest-200 rounded-full text-[10px] font-bold text-forest-600">
                          主角：{bookProtagonist.name}
                        </span>
                      )}
                    </div>

                    {/* Generated story content */}
                    {generatedStoryContent && (
                      <div className="mt-auto">
                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">本集故事</p>
                        <div className="max-h-28 overflow-y-auto rounded-xl bg-forest-50 border border-forest-100 px-3 py-2.5">
                          <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-line">{generatedStoryContent}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <div className="rounded-2xl border border-forest-100 bg-forest-50/60 p-3">
                    <p className="text-[11px] font-bold text-forest-700 mb-2">视频场景数范围</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {VIDEO_SCENE_RANGE_OPTIONS.map((option) => {
                        const active = videoSceneRange === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setVideoSceneRange(option.id)}
                            className={`rounded-xl border px-2.5 py-2 text-left transition-all ${
                              active
                                ? 'bg-forest-500 border-forest-500 text-white shadow-md'
                                : 'bg-white border-forest-100 text-gray-700 hover:border-forest-300'
                            }`}
                          >
                            <p className="text-xs font-extrabold">{option.id} 场景</p>
                            <p className={`text-[10px] mt-0.5 ${active ? 'text-white/80' : 'text-gray-500'}`}>
                              {option.eta}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-forest-700 mt-2">
                      当前选择：{videoSceneRange} 场景
                    </p>
                  </div>
                  <button
                    onClick={handleStartVideo}
                    disabled={startingVideo}
                    className="btn-primary w-full disabled:opacity-60"
                  >
                    {startingVideo ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        正在准备视频...
                      </span>
                    ) : '确认并开始制作视频 🎬'}
                  </button>
                  <Link
                    href={`/story/play?id=${generatedStoryId}`}
                    className="btn-secondary w-full text-center block text-sm"
                  >
                    直接阅读故事 📖
                  </Link>
                  <button
                    onClick={() => {
                      setStep(1)
                      setKeywords('')
                      setSynopsisOptions([])
                      setGeneratedStoryId(null)
                      setGeneratedCoverImage('')
                      setGeneratedStoryContent('')
                      setSelectedSynopsisOpt(null)
                    }}
                    className="btn-secondary w-full text-sm"
                  >
                    再创作一集
                  </button>
                  {selectedStorybookId && (
                    <Link
                      href="/storybook"
                      className="block text-sm text-center text-forest-600 font-bold hover:underline"
                    >
                      返回故事书库
                    </Link>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-component: New book creation sub-flow
// ─────────────────────────────────────────────────────────────

interface NewBookSubFlowProps {
  bookSubStep: number
  setBookSubStep: (n: number) => void
  allCharacters: Character[]
  newProtagonistId: string | null
  setNewProtagonistId: (id: string | null) => void
  newProtagonist: Character | undefined
  newBookStyleId: string
  setNewBookStyleId: (id: string) => void
  selectedCompanionNames: string[]
  toggleCompanion: (name: string) => void
  customCompanion: string
  setCustomCompanion: (v: string) => void
  companionSuggestions: CompanionSuggestion[]
  loadingCompanions: boolean
  fetchCompanions: (protagonistId: string) => void
  newBookName: string
  setNewBookName: (v: string) => void
  newBookAge: '2-4' | '4-6' | '6-8'
  setNewBookAge: (v: '2-4' | '4-6' | '6-8') => void
  savingBook: boolean
  handleCreateNewBook: () => void
  onCancel?: () => void
}

function NewBookSubFlow({
  bookSubStep, setBookSubStep,
  allCharacters,
  newProtagonistId, setNewProtagonistId,
  newProtagonist,
  newBookStyleId, setNewBookStyleId,
  selectedCompanionNames, toggleCompanion,
  customCompanion, setCustomCompanion,
  companionSuggestions, loadingCompanions, fetchCompanions,
  newBookName, setNewBookName,
  newBookAge, setNewBookAge,
  savingBook, handleCreateNewBook,
  onCancel,
}: NewBookSubFlowProps) {
  const SUB_STEPS = ['选择主角', '选择风格', '选小伙伴', '故事书信息']

  const selectedStyle = STYLES.find((s) => s.id === newBookStyleId)
  const protagonistStyleImage = newProtagonist?.styleImages?.[newBookStyleId] ?? newProtagonist?.cartoonImage

  return (
    <div>
      {/* Sub-step header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-forest-800">创建故事书 📚</h1>
          <p className="text-sm text-gray-400 mt-0.5">步骤 {bookSubStep + 1} / {SUB_STEPS.length}</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-xs font-bold text-gray-400 hover:text-gray-600">
            取消
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-6">
        {SUB_STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all ${
              bookSubStep === i ? 'bg-forest-500 border-forest-500 text-white' :
              bookSubStep > i ? 'bg-forest-100 border-forest-300 text-forest-600' :
              'bg-white border-gray-200 text-gray-400'
            }`}>
              {bookSubStep > i ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold hidden sm:block truncate ${bookSubStep === i ? 'text-forest-700' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < SUB_STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Sub-step 0: Select protagonist */}
      {bookSubStep === 0 && (
        <div className="page-enter">
          <h2 className="text-base font-extrabold text-forest-700 mb-4">⭐ 选择故事主角</h2>
          {allCharacters.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-gray-400 mb-3">还没有创建任何角色</p>
              <Link href="/character/create" className="btn-primary text-sm">去创建角色 →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
              {allCharacters.map((c) => {
                const isSelected = newProtagonistId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewProtagonistId(isSelected ? null : c.id)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border-2 transition-all ${
                      isSelected
                        ? 'border-forest-500 bg-forest-50 shadow-md shadow-forest-100'
                        : 'border-gray-200 hover:border-forest-200 bg-white'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden">
                      <Image src={c.cartoonImage} alt={c.name} width={64} height={64} className="object-cover w-full h-full" />
                    </div>
                    <span className="text-xs font-bold text-gray-700 truncate w-full text-center">{c.name || '未命名'}</span>
                    {isSelected && <span className="text-[10px] text-forest-600 font-extrabold">已选✓</span>}
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={() => {
              if (!newProtagonistId) { showToast('请选择一位主角', 'error'); return }
              setBookSubStep(1)
            }}
            disabled={!newProtagonistId}
            className="btn-primary w-full disabled:opacity-50"
          >
            下一步：选择画风 →
          </button>
        </div>
      )}

      {/* Sub-step 1: Select style */}
      {bookSubStep === 1 && (
        <div className="page-enter">
          <button onClick={() => setBookSubStep(0)} className="text-sm text-forest-500 font-bold mb-4 flex items-center gap-1">← 返回</button>
          <h2 className="text-base font-extrabold text-forest-700 mb-1">🎨 选择故事画风</h2>
          <p className="text-xs text-gray-400 mb-4">选择最喜欢的{newProtagonist?.name || '主角'}形象风格，这将是故事书的主要画风</p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {STYLES.map((s) => {
              const styleImg = newProtagonist?.styleImages?.[s.id] ?? newProtagonist?.cartoonImage
              const isSelected = newBookStyleId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setNewBookStyleId(s.id)}
                  className={`flex flex-col items-center rounded-2xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? 'border-forest-500 shadow-md shadow-forest-100'
                      : 'border-gray-200 hover:border-forest-200'
                  }`}
                >
                  <div className="w-full aspect-square bg-gray-100">
                    {styleImg ? (
                      <Image src={styleImg} alt={s.label} width={120} height={120} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">{s.emoji}</div>
                    )}
                  </div>
                  <div className={`w-full py-1.5 px-2 text-center ${isSelected ? 'bg-forest-50' : 'bg-white'}`}>
                    <p className="text-xs font-extrabold text-gray-700 truncate">{s.emoji} {s.label}</p>
                    {isSelected && <p className="text-[10px] text-forest-600 font-bold">已选✓</p>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Large preview of selected style */}
          {protagonistStyleImage && (
            <div className="card p-3 mb-4 flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                <Image src={protagonistStyleImage} alt={selectedStyle?.label ?? ''} width={64} height={64} className="object-cover w-full h-full" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-forest-700">{selectedStyle?.emoji} {selectedStyle?.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{selectedStyle?.description}</p>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setBookSubStep(2)
              if (newProtagonistId) fetchCompanions(newProtagonistId)
            }}
            className="btn-primary w-full"
          >
            下一步：选择小伙伴 →
          </button>
        </div>
      )}

      {/* Sub-step 2: Companions */}
      {bookSubStep === 2 && (
        <div className="page-enter">
          <button onClick={() => setBookSubStep(1)} className="text-sm text-forest-500 font-bold mb-4 flex items-center gap-1">← 返回</button>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-extrabold text-forest-700">🌟 选择冒险小伙伴</h2>
            <button
              onClick={() => { if (newProtagonistId) fetchCompanions(newProtagonistId) }}
              disabled={loadingCompanions}
              className="text-xs font-bold text-forest-500 hover:text-forest-700 disabled:opacity-40"
            >
              {loadingCompanions ? '推荐中...' : '↺ 换一批'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-4">可多选，这些小伙伴将在故事书的每一集中出现</p>

          {loadingCompanions ? (
            <div className="grid grid-cols-1 gap-2 mb-4">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
            </div>
          ) : companionSuggestions.length > 0 ? (
            <div className="space-y-2 mb-4">
              {companionSuggestions.map((c, i) => {
                const isSelected = selectedCompanionNames.includes(c.name)
                return (
                  <button
                    key={i}
                    onClick={() => toggleCompanion(c.name)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-forest-500 bg-forest-50'
                        : 'border-gray-200 hover:border-forest-200'
                    }`}
                  >
                    <span className="text-2xl shrink-0">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-sm text-gray-800">{c.name}</p>
                      <p className="text-[11px] text-gray-400">{c.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? 'border-forest-500 bg-forest-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs text-gray-400 shrink-0">自定义：</span>
            <input
              type="text"
              value={customCompanion}
              onChange={(e) => setCustomCompanion(e.target.value)}
              placeholder="输入小伙伴名称（可不填）"
              className="input py-1.5 text-sm flex-1"
            />
          </div>

          {(selectedCompanionNames.length > 0 || customCompanion.trim()) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selectedCompanionNames.map((name) => (
                <span key={name} className="px-2.5 py-1 rounded-full bg-forest-100 text-forest-700 text-xs font-bold flex items-center gap-1">
                  {companionSuggestions.find((c) => c.name === name)?.emoji} {name}
                  <button onClick={() => toggleCompanion(name)} className="text-forest-400 hover:text-forest-700 ml-0.5">×</button>
                </span>
              ))}
              {customCompanion.trim() && (
                <span className="px-2.5 py-1 rounded-full bg-honey-100 text-honey-700 text-xs font-bold">
                  🌟 {customCompanion.trim()}
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setBookSubStep(3)}
              className="text-sm font-bold text-gray-400 hover:text-gray-600 px-4 py-3"
            >
              跳过
            </button>
            <button
              onClick={() => setBookSubStep(3)}
              className="btn-primary flex-1"
            >
              下一步：命名故事书 →
            </button>
          </div>
        </div>
      )}

      {/* Sub-step 3: Book name + age */}
      {bookSubStep === 3 && (
        <div className="page-enter">
          <button onClick={() => setBookSubStep(2)} className="text-sm text-forest-500 font-bold mb-4 flex items-center gap-1">← 返回</button>
          <h2 className="text-base font-extrabold text-forest-700 mb-4">📖 为故事书命名</h2>

          {/* Preview card */}
          <div className="card mb-5 flex items-center gap-4 bg-gradient-to-r from-forest-50 to-honey-50/50">
            {protagonistStyleImage && (
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-forest-100 shrink-0">
                <Image src={protagonistStyleImage} alt={newProtagonist?.name ?? ''} width={56} height={56} className="object-cover w-full h-full" />
              </div>
            )}
            <div>
              <p className="font-extrabold text-forest-800">{newProtagonist?.name || '主角'} 的故事书</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {selectedStyle?.emoji} {selectedStyle?.label}
                {(selectedCompanionNames.length > 0 || customCompanion.trim()) && (
                  <> · 小伙伴：{[...selectedCompanionNames, customCompanion.trim()].filter(Boolean).join('、')}</>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-forest-600 mb-1.5">故事书名称 *</label>
              <input
                type="text"
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                placeholder={`${newProtagonist?.name || '主角'}的奇妙冒险`}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-forest-600 mb-1.5">适读年龄</label>
              <div className="flex gap-2">
                {AGE_OPTIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setNewBookAge(a.value)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                      newBookAge === a.value
                        ? 'border-forest-500 bg-forest-100 text-forest-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {a.emoji} {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateNewBook}
            disabled={savingBook || !newBookName.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {savingBook ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                创建中...
              </span>
            ) : '创建故事书，开始创作第一集 →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-component: Existing book selection
// ─────────────────────────────────────────────────────────────

interface ExistingBookSelectionProps {
  storybooks: Storybook[]
  allCharacters: Character[]
  selectedStorybookId: string | null
  setSelectedStorybookId: (id: string) => void
  bookProtagonist: Character | null
  bookProtagonistImage: string | null
  currentBook: Storybook | null
  onCreateNew: () => void
  onNext: () => void
}

function ExistingBookSelection({
  storybooks, allCharacters,
  selectedStorybookId, setSelectedStorybookId,
  onCreateNew, onNext,
}: ExistingBookSelectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-forest-800">选择故事书 📚</h1>
          <p className="text-sm text-gray-400 mt-0.5">为哪本故事书创作新一集？</p>
        </div>
        <button
          onClick={onCreateNew}
          className="text-xs font-bold px-3 py-2 border-2 border-forest-300 text-forest-600 rounded-full hover:bg-forest-50 transition-colors"
        >
          + 新建故事书
        </button>
      </div>

      <div className="space-y-2 mb-6">
        {storybooks.map((book) => {
          const protagonistEntry = book.characters.find((c) => c.role === 'protagonist')
          const protagonist = allCharacters.find((c) => c.id === protagonistEntry?.id)
          const styleConfig = STYLES.find((s) => s.id === book.styleId)
          const styledImg = protagonist
            ? (protagonist.styleImages?.[book.styleId] ?? protagonist.cartoonImage)
            : null
          const isSelected = selectedStorybookId === book.id
          const chapterCount = (book.chapters?.length ?? 0)

          return (
            <button
              key={book.id}
              onClick={() => setSelectedStorybookId(book.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-forest-500 bg-forest-50 shadow-md shadow-forest-100'
                  : 'border-gray-200 bg-white hover:border-forest-200'
              }`}
            >
              {/* Protagonist thumbnail */}
              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-forest-100 shrink-0 bg-gray-100">
                {styledImg ? (
                  <Image src={styledImg} alt={protagonist?.name ?? ''} width={56} height={56} className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">{styleConfig?.emoji ?? '📖'}</div>
                )}
              </div>

              {/* Book info */}
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-forest-800 truncate">{book.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] bg-forest-100 text-forest-600 px-1.5 py-0.5 rounded-full font-bold">{book.ageRange}岁</span>
                  {styleConfig && <span className="text-[10px] text-gray-400">{styleConfig.emoji} {styleConfig.label}</span>}
                  <span className="text-[10px] text-gray-400">· {chapterCount === 0 ? '暂无故事' : `${chapterCount} 集`}</span>
                </div>
              </div>

              {/* Select indicator */}
              <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                isSelected ? 'border-forest-500 bg-forest-500' : 'border-gray-300'
              }`}>
                {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onNext}
        disabled={!selectedStorybookId}
        className="btn-primary w-full disabled:opacity-50"
      >
        下一步：填写灵感种子 →
      </button>
    </div>
  )
}
