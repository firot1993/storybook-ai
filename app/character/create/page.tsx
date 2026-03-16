'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Character } from '@/types'
import { STYLES } from '@/lib/styles'
import { showToast } from '@/components/toast'
import { useLanguage } from '@/lib/i18n'

const RANDOM_NAMES = [
  'Sparkle', 'Max', 'Luna', 'Binkie', 'Oliver', 'Daisy',
  'Ziggy', 'Pip', 'Bubbles', 'Leo', 'Ginger', 'Toby', 'Mochi', 'Finn',
]

const PROGRESS_STEP_KEYS = ['0', '1', '2', '3'] as const

export default function CharacterCreatePage() {
  const router = useRouter()
  const { locale, t } = useLanguage()

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [pronoun, setPronoun] = useState('')
  const [customPronoun, setCustomPronoun] = useState('')
  const [characterRole, setCharacterRole] = useState('')
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
        setProgressStep((prev) => Math.min(prev + 1, PROGRESS_STEP_KEYS.length - 1))
      }, 4500)
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [generating])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast(t('characterCreate.errors.uploadFormat'), 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast(t('characterCreate.errors.uploadSize'), 'error'); return }
    const dataUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result as string)
      reader.onerror = rej
      reader.readAsDataURL(file)
    })
    setPhotoPreview(dataUrl)
    setPhotoBase64(dataUrl.split(',')[1])
    setCharacter(null); setVoiceName(''); setVoiceReason('')
  }, [t])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) loadFile(file)
  }
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]; if (file) loadFile(file)
  }, [loadFile])

  const handleGenerate = async () => {
    if (!photoBase64) { showToast(t('characterCreate.errors.noPhoto'), 'error'); return }
    setGenerating(true); setCharacter(null)
    try {
      const ageNum = age ? parseInt(age, 10) : undefined
      const res = await fetch('/api/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photoBase64,
          styleId: activeStyleId,
          name: name.trim(),
          ...(ageNum ? { age: ageNum } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const char: Character = data.character
        setCharacter(char)
        const initialStyle =
          STYLES.find((s) => s.id === char.style && char.styleImages?.[s.id]) ??
          STYLES.find((s) => char.styleImages?.[s.id]) ??
          STYLES[0]
        setActiveStyleId(initialStyle.id)
        localStorage.setItem('currentCharacter', JSON.stringify(char))
        if (char.voiceName) setVoiceName(char.voiceName)
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        showToast(data?.error || t('characterCreate.errors.genFailed'), 'error')
      }
    } catch {
      showToast(t('characterCreate.errors.genFailed'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleAssignVoice = async () => {
    if (!character) return
    setAssigningVoice(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      const activeImage = character.styleImages?.[activeStyleId] ?? character.cartoonImage
      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || character.name,
          ...(ageNum !== null ? { age: ageNum } : {}),
          style: activeStyleId,
          cartoonImage: activeImage,
        }),
      })
      const res = await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignVoice', locale }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('characterCreate.errors.voiceFailed'))
      setVoiceName(data.voiceName); setVoiceReason(data.reason || '')
      const updated = {
        ...character,
        voiceName: data.voiceName,
        style: activeStyleId,
        cartoonImage: activeImage,
      }
      setCharacter(updated); localStorage.setItem('currentCharacter', JSON.stringify(updated))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('characterCreate.errors.voiceFailed'), 'error')
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
        body: JSON.stringify({ voiceName, name: name.trim(), locale }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const audio = new Audio(data.audioDataUrl)
      audioRef.current = audio
      audio.onended = () => setPreviewPlaying(false)
      audio.onerror = () => { setPreviewPlaying(false); showToast(t('characterCreate.errors.playFailed'), 'error') }
      await audio.play(); setPreviewPlaying(true)
    } catch { showToast(t('characterCreate.errors.voicePreviewFailed'), 'error') }
    finally { setPreviewLoading(false) }
  }

  const handleSave = async () => {
    if (!name.trim()) { showToast(t('characterCreate.errors.noName'), 'error'); return }
    if (!character) return
    setSaving(true)
    try {
      const ageNum = age ? parseInt(age, 10) : null
      const activeImage = character.styleImages?.[activeStyleId] ?? character.cartoonImage
      const resolvedPronoun = pronoun === 'other' ? customPronoun.trim() : pronoun
      const updated: Character = {
        ...character, name: name.trim(),
        age: ageNum ?? undefined,
        voiceName: voiceName || character.voiceName,
        cartoonImage: activeImage, style: activeStyleId,
        pronoun: resolvedPronoun,
        role: characterRole.trim(),
      }
      localStorage.setItem('currentCharacter', JSON.stringify(updated))
      await fetch(`/api/character/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(ageNum !== null ? { age: ageNum } : {}),
          ...(voiceName ? { voiceName } : {}),
          style: activeStyleId,
          cartoonImage: activeImage,
          pronoun: resolvedPronoun,
          role: characterRole.trim(),
        }),
      })
      showToast(t('characterCreate.success', { name: name.trim() }), 'success')
      router.push('/character')
    } catch { showToast(t('characterCreate.errors.saveFailed'), 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden px-4 pt-2 pb-3">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">

        {/* Back */}
        <Link href="/character" className="text-gray-400 hover:text-ember-600 mb-2 inline-flex items-center gap-1 text-sm font-bold shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('characterCreate.backLink')}
        </Link>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">

          {/* LEFT: form */}
          <div className="lg:w-[340px] shrink-0 flex flex-col gap-2.5 overflow-y-auto">

            {/* Style picker */}
            <div className="card !p-3">
              <p className="text-xs font-accent font-bold text-forest-700 mb-2">{t('characterCreate.styleLabel')}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {STYLES.map((s) => {
                  const hasGenerated = !!(character?.styleImages?.[s.id])
                  const isActive = activeStyleId === s.id
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setActiveStyleId(s.id)}
                      className={`relative flex flex-col items-center rounded-xl overflow-hidden border-2 transition-all ${
                        isActive ? 'border-forest-500 shadow ring-2 ring-forest-200 scale-105' : 'border-transparent hover:border-forest-200'
                      } ${!hasGenerated && character ? 'opacity-40' : ''}`}
                    >
                      <div className="relative w-full aspect-square bg-gray-100">
                        <Image
                          src={hasGenerated ? character!.styleImages![s.id] : s.exampleImageUrl}
                          alt={t(`styles.${s.id}.label`)} fill className="object-cover" sizes="64px"
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
                        {t(`styles.${s.id}.label`)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Form */}
            <div className="card !p-3 flex-1 flex flex-col gap-2.5">
              <h1 className="text-sm font-accent font-bold text-forest-700">{t('characterCreate.formHeading')}</h1>

              {/* Name */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-600">{t('characterCreate.nameLabel')}</label>
                  <button type="button" onClick={() => setName(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])}
                    className="text-xs font-bold text-ember-500 hover:text-ember-700">{t('characterCreate.randomBtn')}</button>
                </div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('characterCreate.namePlaceholder')} className="input !py-1.5 !text-sm" />
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{t('characterCreate.ageLabel')}</label>
                <div className="flex gap-1 flex-wrap">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((a) => (
                    <button key={a} type="button" onClick={() => setAge(age === String(a) ? '' : String(a))}
                      className={`w-7 h-7 rounded-full text-xs font-bold border-2 transition-all ${
                        age === String(a) ? 'border-ember-500 bg-ember-500 text-white shadow' : 'border-gray-200 text-gray-500 hover:border-ember-300'
                      }`}>{a}</button>
                  ))}
                </div>
              </div>

              {/* Pronoun */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{t('characterCreate.pronounLabel')}</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { label: t('characterCreate.pronounBoy'), value: 'he/him' },
                    { label: t('characterCreate.pronounGirl'), value: 'she/her' },
                    { label: t('characterCreate.pronounOther'), value: 'other' },
                  ].map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => { setPronoun(pronoun === opt.value ? '' : opt.value); if (opt.value !== 'other') setCustomPronoun('') }}
                      className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                        pronoun === opt.value ? 'border-ember-500 bg-ember-500 text-white shadow' : 'border-gray-200 text-gray-500 hover:border-ember-300'
                      }`}>{opt.label}</button>
                  ))}
                </div>
                {pronoun === 'other' && (
                  <input type="text" value={customPronoun} onChange={(e) => setCustomPronoun(e.target.value)}
                    placeholder={t('characterCreate.pronounCustomPlaceholder')} className="input !py-1.5 !text-sm mt-1.5" />
                )}
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{t('characterCreate.roleLabel')}</label>
                <div className="flex gap-1.5 flex-wrap mb-1.5">
                  {['explorer', 'dreamer', 'scholar', 'prankster', 'guardian', 'trickster'].map((chip) => (
                    <button key={chip} type="button"
                      onClick={() => setCharacterRole(characterRole === chip ? '' : chip)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                        characterRole === chip ? 'border-ember-500 bg-ember-500 text-white shadow' : 'border-gray-200 text-gray-500 hover:border-ember-300'
                      }`}>{t(`characterCreate.roles.${chip}`)}</button>
                  ))}
                </div>
                <input type="text" value={characterRole} onChange={(e) => setCharacterRole(e.target.value)}
                  placeholder={t('characterCreate.rolePlaceholder')} className="input !py-1.5 !text-sm" />
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{t('characterCreate.photoLabel')}</label>
                {!photoPreview ? (
                  <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-3 text-center transition-all ${
                      isDragging ? 'border-ember-500 bg-ember-50' : 'border-gray-300 hover:border-ember-400 hover:bg-ember-50/40'
                    }`}>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="photo-upload" />
                    <label htmlFor="photo-upload" className="flex items-center justify-center gap-2 cursor-pointer">
                      <span className="text-lg">{isDragging ? '🌟' : '📸'}</span>
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-600">{isDragging ? t('characterCreate.dragRelease') : t('characterCreate.dragDefault')}</p>
                        <p className="text-xs text-gray-400">{t('characterCreate.dragHint')}</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border-2 border-gray-200 shadow shrink-0">
                      <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-700">{t('characterCreate.photoUploaded')}</p>
                      <label htmlFor="photo-change" className="text-xs text-ember-500 hover:text-ember-700 font-bold cursor-pointer underline underline-offset-2">{t('characterCreate.changePhoto')}</label>
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="photo-change" />
                    </div>
                  </div>
                )}
              </div>

              {/* Generate */}
              <button type="button" onClick={handleGenerate} disabled={generating || !photoBase64}
                className="btn-primary w-full disabled:opacity-50 !py-2 !text-sm mt-auto">
                {generating
                  ? <span className="flex items-center justify-center gap-1.5"><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />{t('characterCreate.generating')}</span>
                  : t('characterCreate.generateBtn')}
              </button>
            </div>
          </div>

          {/* RIGHT: preview / progress / result */}
          <div className="flex-1 min-w-0 overflow-y-auto">

            {/* Idle */}
            {!generating && !character && (
              <div className="card page-enter h-full flex flex-col !p-0 overflow-hidden">
                <div className="relative flex-1 bg-gradient-to-br from-gray-50 to-honey-50/30 min-h-[200px]">
                  <Image src={activeStyle.exampleImageUrl} alt={t(`styles.${activeStyle.id}.label`)}
                    fill className="object-contain p-8" sizes="(max-width:1024px) 100vw, 600px" priority />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow border border-gray-200 flex items-center gap-1">
                    <span className="text-sm">{activeStyle.emoji}</span>
                    <span className="font-bold text-forest-700 text-xs">{t(`styles.${activeStyle.id}.label`)}</span>
                  </div>
                </div>
                <div className="p-3 border-t border-gray-100 shrink-0">
                  <p className="text-xs font-bold text-forest-700 mb-0.5">{t(`styles.${activeStyle.id}.label`)}</p>
                  <p className="text-xs text-gray-400">{t(`styles.${activeStyle.id}.description`)}</p>
                  <p className="text-xs text-gray-400 mt-2 text-center">{t('characterCreate.idleHint')}</p>
                </div>
              </div>
            )}

            {/* Generating */}
            {generating && (
              <div className="card page-enter h-full flex flex-col items-center justify-center text-center py-6">
                <div className="text-4xl mb-3 animate-fade-in">
                  {progressStep === 0 ? '🔍' : progressStep === 1 ? '🎨' : progressStep === 2 ? '✨' : '🌟'}
                </div>
                <p className="font-extrabold text-forest-700 mb-1">{t(`characterCreate.progressSteps.${progressStep as 0 | 1 | 2 | 3}`)}</p>
                <p className="text-xs text-gray-400 mb-5">{t('characterCreate.generatingSubtext')}</p>
                <div className="w-full max-w-xs">
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-ember-400 to-ember-600 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${((progressStep + 1) / PROGRESS_STEP_KEYS.length) * 100}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{t('characterCreate.timeEstimate')}</p>
                </div>
              </div>
            )}

            {/* Result */}
            {character && !generating && (
              <div className="card page-enter flex flex-col gap-3 h-full">
                <h2 className="text-sm font-accent font-bold text-center text-forest-700 shrink-0">{t('characterCreate.doneHeading')}</h2>

                {/* Portrait + style strip */}
                <div className="flex gap-3 items-start shrink-0">
                  <div className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="rounded-2xl p-1 bg-gradient-to-br from-forest-400 to-forest-600 shadow-lg inline-block">
                      <Image src={displayImage} alt="Character"
                        width={180} height={180}
                        className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl object-cover bg-white" />
                    </div>
                    <span className="text-xs font-bold text-forest-500">
                      {activeStyle.emoji} {t(`styles.${activeStyle.id}.label`)}
                      {name && <span className="text-gray-400 font-normal"> · {name}</span>}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <p className="text-xs font-bold text-gray-400 text-center">{t('characterCreate.switchStyleLabel')}</p>
                    {STYLES.map((s) => {
                      const img = character.styleImages?.[s.id]
                      const isActive = activeStyleId === s.id
                      return (
                        <button key={s.id} type="button" disabled={!img}
                          onClick={() => { if (img) setActiveStyleId(s.id) }}
                          className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                            isActive ? 'border-forest-500 shadow-md ring-1 ring-forest-300 scale-105'
                            : img ? 'border-gray-200 hover:border-ember-300' : 'border-gray-100 opacity-30 cursor-not-allowed'
                          }`}>
                          <Image src={img ?? s.exampleImageUrl} alt={t(`styles.${s.id}.label`)} fill className="object-cover" sizes="48px" />
                          {isActive && (
                            <div className="absolute bottom-0 inset-x-0 bg-forest-500 text-white text-[8px] font-bold text-center leading-4">{t(`styles.${s.id}.label`)}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button type="button" onClick={handleGenerate} disabled={generating}
                  className="text-xs font-bold text-gray-400 hover:text-forest-600 disabled:opacity-50 self-center">
                  {t('characterCreate.regenerateBtn')}
                </button>

                {/* Voice */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700">{t('characterCreate.voiceLabel')}</p>
                    <button type="button" onClick={handleAssignVoice} disabled={assigningVoice}
                      className="text-xs font-bold px-3 py-1 bg-ember-500 text-white rounded-full hover:bg-ember-600 disabled:opacity-60 transition-colors">
                      {assigningVoice
                        ? <span className="flex items-center gap-1"><span className="animate-spin w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full" />{t('characterCreate.assigningVoice')}</span>
                        : voiceName ? t('characterCreate.changeVoice') : t('characterCreate.assignVoice')}
                    </button>
                  </div>
                  {voiceName ? (
                    <div className="bg-white rounded-lg p-2.5 border border-gray-200 flex items-center gap-2.5">
                      <button type="button" onClick={handlePlayVoicePreview} disabled={previewLoading}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all shadow-sm ${
                          previewPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-ember-500 hover:bg-ember-600'
                        } text-white disabled:opacity-60`}>
                        {previewLoading
                          ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                          : previewPlaying
                          ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="6" width="4" height="12" rx="1"/></svg>
                          : <svg className="w-3 h-3 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-forest-700">{voiceName}</p>
                        <p className="text-xs text-gray-400">{t(`voices.${voiceName}`) || t('characterCreate.defaultVoiceDesc')}{voiceReason && ` · ${voiceReason}`}</p>
                      </div>
                      {previewPlaying && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-0.5 bg-forest-400 rounded-full animate-pulse"
                              style={{ height: `${6 + (i % 3) * 5}px`, animationDelay: `${i * 0.12}s` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-1">{t('characterCreate.noVoice')}</p>
                  )}
                </div>

                {/* Save */}
                <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
                  className="btn-primary w-full disabled:opacity-50 !py-2 !text-sm shrink-0">
                  {saving ? t('characterCreate.saving') : t('characterCreate.saveBtn')}
                </button>
                {!name.trim() && (
                  <p className="text-center text-xs text-gray-400 -mt-2">{t('characterCreate.saveHint')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
