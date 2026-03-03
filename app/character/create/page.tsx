'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Character } from '@/types'
import { STYLES } from '@/lib/styles'
import { showToast } from '@/components/toast'

const RANDOM_NAMES = [
  'Sparkle', 'Max', 'Luna', 'Binkie', 'Oliver', 'Daisy',
  'Ziggy', 'Pip', 'Bubbles', 'Leo', 'Ginger', 'Toby', 'Mochi', 'Finn',
]

const VOICE_DESCRIPTIONS: Record<string, string> = {
  Puck: '活泼开朗', Leda: '清新明亮', Zephyr: '阳光活力',
  Fenrir: '激情四射', Aoede: '温暖柔和',
}

const PROGRESS_STEPS = [
  { emoji: '🔍', text: '正在分析照片...' },
  { emoji: '🎨', text: '绘制 5 种风格中...' },
  { emoji: '✨', text: '精细润色中...' },
  { emoji: '🌟', text: '即将完成...' },
]

export default function CharacterCreatePage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const [character, setCharacter] = useState<Character | null>(null)
  const [activeStyleId, setActiveStyleId] = useState(STYLES[0].id)
  const [voiceName, setVoiceName] = useState('')
  const [voiceReason, setVoiceReason] = useState('')
  const [assigningVoice, setAssigningVoice] = useState(false)
  const [saving, setSaving] = useState(false)

  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const activeStyle = STYLES.find((s) => s.id === activeStyleId) ?? STYLES[0]
  const displayImage = character?.styleImages?.[activeStyleId] ?? character?.cartoonImage ?? ''

  useEffect(() => {
    if (generating) {
      setProgressStep(0)
      progressInterval.current = setInterval(() => {
        setProgressStep((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
      }, 4500)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [generating])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const loadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('请上传 JPG 或 PNG 图片', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('图片太大，最多 5 MB', 'error'); return }
    const dataUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result as string)
      reader.onerror = rej
      reader.readAsDataURL(file)
    })
    setPhotoPreview(dataUrl)
    setPhotoBase64(dataUrl.split(',')[1])
    setCharacter(null); setVoiceName(''); setVoiceReason('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) loadFile(file)
  }
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]; if (file) loadFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerate = async () => {
    if (!photoBase64) { showToast('请先上传一张照片！', 'error'); return }
    setGenerating(true); setCharacter(null)
    try {
      const ageNum = age ? parseInt(age, 10) : undefined
      const res = await fetch('/api/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photoBase64,
          styleId: STYLES[0].id,
          name: name.trim(),
          ...(ageNum ? { age: ageNum } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const char: Character = data.character
        setCharacter(char)
        const first = STYLES.find((s) => char.styleImages?.[s.id]) ?? STYLES[0]
        setActiveStyleId(first.id)
        localStorage.setItem('currentCharacter', JSON.stringify(char))
        if (char.voiceName) setVoiceName(char.voiceName)
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        showToast(data?.error || '生成失败，请重试！', 'error')
      }
    } catch {
      showToast('生成失败，请重试！', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleAssignVoice = async () => {
    if (!character) return
    setAssigningVoice(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || character.name, ...(ageNum !== null ? { age: ageNum } : {}) }),
      })
      const res = await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignVoice' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '声音分配失败')
      setVoiceName(data.voiceName); setVoiceReason(data.reason || '')
      const updated = { ...character, voiceName: data.voiceName }
      setCharacter(updated); localStorage.setItem('currentCharacter', JSON.stringify(updated))
    } catch (err) {
      showToast(err instanceof Error ? err.message : '声音分配失败', 'error')
    } finally {
      setAssigningVoice(false)
    }
  }

  const handlePlayVoicePreview = async () => {
    if (!voiceName) return
    if (previewPlaying && audioRef.current) {
      audioRef.current.pause(); audioRef.current.currentTime = 0
      setPreviewPlaying(false); return
    }
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceName, name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const audio = new Audio(data.audioDataUrl)
      audioRef.current = audio
      audio.onended = () => setPreviewPlaying(false)
      audio.onerror = () => { setPreviewPlaying(false); showToast('播放失败', 'error') }
      await audio.play(); setPreviewPlaying(true)
    } catch { showToast('声音预览失败，请重试', 'error') }
    finally { setPreviewLoading(false) }
  }

  const handleSave = async () => {
    if (!name.trim()) { showToast('请给角色起个名字！', 'error'); return }
    if (!character) return
    setSaving(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      const activeImage = character.styleImages?.[activeStyleId] ?? character.cartoonImage
      const updated: Character = {
        ...character, name: name.trim(),
        age: ageNum ?? undefined,
        voiceName: voiceName || character.voiceName,
        cartoonImage: activeImage, style: activeStyleId,
      }
      localStorage.setItem('currentCharacter', JSON.stringify(updated))
      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(ageNum !== null ? { age: ageNum } : {}),
          ...(voiceName ? { voiceName } : {}),
        }),
      })
      showToast(`${name.trim()} 创建成功！✨`, 'success')
      router.push('/character')
    } catch { showToast('保存失败，请重试！', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden px-4 pt-2 pb-3">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">

        {/* Back */}
        <Link href="/character" className="text-forest-400 hover:text-forest-600 mb-2 inline-flex items-center gap-1 text-sm font-bold shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          我的角色
        </Link>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">

          {/* LEFT: form */}
          <div className="lg:w-[340px] shrink-0 flex flex-col gap-2.5 overflow-y-auto">

            {/* Style picker */}
            <div className="card !p-3">
              <p className="text-xs font-extrabold text-forest-700 mb-2">🎨 选择风格（生成后可随时切换）</p>
              <div className="grid grid-cols-5 gap-1.5">
                {STYLES.map((s) => {
                  const hasGenerated = !!(character?.styleImages?.[s.id])
                  const isActive = activeStyleId === s.id
                  return (
                    <button key={s.id} type="button"
                      onClick={() => { if (hasGenerated) setActiveStyleId(s.id) }}
                      className={`relative flex flex-col items-center rounded-xl overflow-hidden border-2 transition-all ${
                        isActive ? 'border-forest-500 shadow ring-2 ring-forest-200 scale-105' : 'border-transparent hover:border-forest-200'
                      } ${!hasGenerated && character ? 'opacity-40' : ''}`}
                    >
                      <div className="relative w-full aspect-square bg-gray-100">
                        <Image
                          src={hasGenerated ? character!.styleImages![s.id] : s.exampleImageUrl}
                          alt={s.label} fill className="object-cover" sizes="64px"
                        />
                        {isActive && (
                          <div className="absolute inset-0 bg-forest-500/20 flex items-center justify-center">
                            <div className="w-3.5 h-3.5 rounded-full bg-forest-500 flex items-center justify-center shadow">
                              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={`w-full py-0.5 text-center text-[9px] font-bold ${isActive ? 'bg-forest-500 text-white' : 'bg-white text-gray-400'}`}>
                        {s.label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Form */}
            <div className="card !p-3 flex-1 flex flex-col gap-2.5">
              <h1 className="text-sm font-extrabold text-forest-700">创建你的角色</h1>

              {/* Name */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-600">角色名字</label>
                  <button type="button" onClick={() => setName(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])}
                    className="text-[10px] font-bold text-forest-500 hover:text-forest-700">🎲 随机</button>
                </div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="例如：Luna、小明" className="input !py-1.5 !text-sm" />
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">年龄（可选）</label>
                <div className="flex gap-1 flex-wrap">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((a) => (
                    <button key={a} type="button" onClick={() => setAge(age === String(a) ? '' : String(a))}
                      className={`w-7 h-7 rounded-full text-xs font-bold border-2 transition-all ${
                        age === String(a) ? 'border-forest-500 bg-forest-500 text-white shadow' : 'border-gray-200 text-gray-500 hover:border-forest-300'
                      }`}>{a}</button>
                  ))}
                </div>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">上传照片</label>
                {!photoPreview ? (
                  <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-3 text-center transition-all ${
                      isDragging ? 'border-forest-500 bg-forest-50' : 'border-gray-300 hover:border-forest-400 hover:bg-forest-50/40'
                    }`}>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="photo-upload" />
                    <label htmlFor="photo-upload" className="flex items-center justify-center gap-2 cursor-pointer">
                      <span className="text-lg">{isDragging ? '🌟' : '📸'}</span>
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-600">{isDragging ? '放开上传！' : '点击或拖拽上传'}</p>
                        <p className="text-[10px] text-gray-400">JPG · PNG · 最大 5MB</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border-2 border-forest-200 shadow shrink-0">
                      <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-700">照片已上传 ✓</p>
                      <label htmlFor="photo-change" className="text-[10px] text-forest-500 hover:text-forest-700 font-bold cursor-pointer underline underline-offset-2">更换</label>
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="photo-change" />
                    </div>
                  </div>
                )}
              </div>

              {/* Generate */}
              <button type="button" onClick={handleGenerate} disabled={generating || !photoBase64}
                className="btn-primary w-full disabled:opacity-50 !py-2 !text-sm mt-auto">
                {generating
                  ? <span className="flex items-center justify-center gap-1.5"><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />生成中...</span>
                  : '✨ 一键生成全部风格'}
              </button>
            </div>
          </div>

          {/* RIGHT: preview / progress / result */}
          <div className="flex-1 min-w-0 overflow-y-auto">

            {/* Idle */}
            {!generating && !character && (
              <div className="card page-enter h-full flex flex-col !p-0 overflow-hidden">
                <div className="relative flex-1 bg-gradient-to-br from-forest-50 to-honey-50 min-h-[200px]">
                  <Image src={activeStyle.exampleImageUrl} alt={activeStyle.label}
                    fill className="object-contain p-8" sizes="(max-width:1024px) 100vw, 600px" priority />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow border border-forest-100 flex items-center gap-1">
                    <span className="text-sm">{activeStyle.emoji}</span>
                    <span className="font-bold text-forest-700 text-xs">{activeStyle.label}</span>
                  </div>
                </div>
                <div className="p-3 border-t border-gray-100 shrink-0">
                  <p className="text-xs font-bold text-forest-700 mb-0.5">{activeStyle.label}</p>
                  <p className="text-xs text-gray-400">{activeStyle.description}</p>
                  <p className="text-[10px] text-gray-400 mt-2 text-center">上传照片 → 一键生成全部 5 种风格角色图</p>
                </div>
              </div>
            )}

            {/* Generating */}
            {generating && (
              <div className="card page-enter h-full flex flex-col items-center justify-center text-center py-6">
                <div className="text-4xl mb-3 animate-bounce-star">{PROGRESS_STEPS[progressStep].emoji}</div>
                <p className="font-extrabold text-forest-700 mb-1">{PROGRESS_STEPS[progressStep].text}</p>
                <p className="text-xs text-gray-400 mb-5">正在同时生成 5 种风格，请稍候...</p>
                <div className="w-full max-w-xs">
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-forest-400 to-forest-600 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">大约需要 30–60 秒...</p>
                </div>
              </div>
            )}

            {/* Result */}
            {character && !generating && (
              <div className="card page-enter flex flex-col gap-3 h-full">
                <h2 className="text-sm font-extrabold text-center text-forest-700 shrink-0">⭐ 5 种风格全部生成完成！点击缩略图切换</h2>

                {/* Portrait + style strip */}
                <div className="flex gap-3 items-start shrink-0">
                  <div className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="rounded-2xl p-1 bg-gradient-to-br from-forest-400 to-forest-600 shadow-lg inline-block">
                      <Image src={displayImage} alt="Character"
                        width={180} height={180}
                        className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl object-cover bg-white" />
                    </div>
                    <span className="text-[10px] font-bold text-forest-500">
                      {activeStyle.emoji} {activeStyle.label}
                      {name && <span className="text-gray-400 font-normal"> · {name}</span>}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 text-center">切换风格</p>
                    {STYLES.map((s) => {
                      const img = character.styleImages?.[s.id]
                      const isActive = activeStyleId === s.id
                      return (
                        <button key={s.id} type="button" disabled={!img}
                          onClick={() => { if (img) setActiveStyleId(s.id) }}
                          className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                            isActive ? 'border-forest-500 shadow-md ring-1 ring-forest-300 scale-105'
                            : img ? 'border-gray-200 hover:border-forest-300' : 'border-gray-100 opacity-30 cursor-not-allowed'
                          }`}>
                          <Image src={img ?? s.exampleImageUrl} alt={s.label} fill className="object-cover" sizes="48px" />
                          {isActive && (
                            <div className="absolute bottom-0 inset-x-0 bg-forest-500 text-white text-[8px] font-bold text-center leading-4">{s.label}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button type="button" onClick={handleGenerate} disabled={generating}
                  className="text-xs font-bold text-gray-400 hover:text-forest-600 disabled:opacity-50 self-center">
                  ↺ 重新生成
                </button>

                {/* Voice */}
                <div className="bg-gradient-to-br from-forest-50 to-honey-50 rounded-xl p-3 border border-forest-100 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700">🎙️ 角色声音</p>
                    <button type="button" onClick={handleAssignVoice} disabled={assigningVoice}
                      className="text-xs font-bold px-3 py-1 bg-forest-500 text-white rounded-full hover:bg-forest-600 disabled:opacity-60 transition-colors">
                      {assigningVoice
                        ? <span className="flex items-center gap-1"><span className="animate-spin w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full" />分配中...</span>
                        : voiceName ? '↺ 换声音' : '🎙️ 分配'}
                    </button>
                  </div>
                  {voiceName ? (
                    <div className="bg-white rounded-lg p-2.5 border border-forest-100 flex items-center gap-2.5">
                      <button type="button" onClick={handlePlayVoicePreview} disabled={previewLoading}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all shadow-sm ${
                          previewPlaying ? 'bg-ember-500 hover:bg-ember-600' : 'bg-forest-500 hover:bg-forest-600'
                        } text-white disabled:opacity-60`}>
                        {previewLoading
                          ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                          : previewPlaying
                          ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="6" width="4" height="12" rx="1"/></svg>
                          : <svg className="w-3 h-3 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-forest-700">{voiceName}</p>
                        <p className="text-[10px] text-gray-400">{VOICE_DESCRIPTIONS[voiceName] ?? '专属声音'}{voiceReason && ` · ${voiceReason}`}</p>
                      </div>
                      {previewPlaying && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-0.5 bg-forest-400 rounded-full animate-bounce-star"
                              style={{ height: `${6 + (i % 3) * 5}px`, animationDelay: `${i * 0.12}s` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400 text-center py-1">尚未分配声音，点击上方按钮开始</p>
                  )}
                </div>

                {/* Save */}
                <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
                  className="btn-primary w-full disabled:opacity-50 !py-2 !text-sm shrink-0">
                  {saving ? '保存中...' : '保存角色档案 ✨'}
                </button>
                {!name.trim() && (
                  <p className="text-center text-[10px] text-gray-400 -mt-2">请先在左侧输入角色名字</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
