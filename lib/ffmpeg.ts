import ffmpeg from 'fluent-ffmpeg'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { SubtitleCue, ScriptScene } from '@/types'

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
}

const X264_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
])

export type FfmpegRuntimeConfig = {
  threads: number
  scenePreset: string
  subtitlePreset: string
  crf: number
  audioBitrate: string
}

function detectAvailableCpuCount(): number {
  const count = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1
}

export function getDefaultFfmpegThreads(availableCpuCount = detectAvailableCpuCount()): number {
  const safeCpuCount = Number.isFinite(availableCpuCount) && availableCpuCount > 0
    ? Math.trunc(availableCpuCount)
    : 1
  const headroom = safeCpuCount > 1 ? 1 : 0
  return Math.max(1, Math.min(3, safeCpuCount - headroom))
}

export function clampFfmpegThreads(requested: number, availableCpuCount = detectAvailableCpuCount()): number {
  const safeCpuCount = Number.isFinite(availableCpuCount) && availableCpuCount > 0
    ? Math.trunc(availableCpuCount)
    : 1
  const safeRequested = Number.isFinite(requested) && requested > 0
    ? Math.trunc(requested)
    : getDefaultFfmpegThreads(safeCpuCount)
  return Math.max(1, Math.min(safeRequested, safeCpuCount))
}

function parseX264Preset(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase()
  return normalized && X264_PRESETS.has(normalized) ? normalized : fallback
}

function parseCrf(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(18, Math.min(32, parsed))
}

function parseAudioBitrate(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase()
  return normalized && /^\d+(k|m)?$/.test(normalized) ? normalized : fallback
}

export function getFfmpegRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
  availableCpuCount = detectAvailableCpuCount()
): FfmpegRuntimeConfig {
  const defaultThreads = getDefaultFfmpegThreads(availableCpuCount)
  const requestedThreads = Number.parseInt(env.FFMPEG_THREADS ?? '', 10)
  const scenePreset = parseX264Preset(env.FFMPEG_X264_PRESET, 'veryfast')

  return {
    threads: Number.isFinite(requestedThreads)
      ? clampFfmpegThreads(requestedThreads, availableCpuCount)
      : defaultThreads,
    scenePreset,
    subtitlePreset: parseX264Preset(env.FFMPEG_SUBTITLE_X264_PRESET, scenePreset),
    crf: parseCrf(env.FFMPEG_CRF, 24),
    audioBitrate: parseAudioBitrate(env.FFMPEG_AUDIO_BITRATE, '128k'),
  }
}

const FFMPEG_RUNTIME = getFfmpegRuntimeConfig()

export function getActiveFfmpegRuntimeConfig(): FfmpegRuntimeConfig {
  return { ...FFMPEG_RUNTIME }
}

// ── Helpers ──────────────────────────────────────────────────

function msToSrtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const frac = ms % 1000
  return `${pad(h)}:${pad(m)}:${pad(sec)},${padMs(frac)}`
}
function pad(n: number) { return String(n).padStart(2, '0') }
function padMs(n: number) { return String(n).padStart(3, '0') }

function fontColorToAss(color: string): string {
  // ASS color format is &HAABBGGRR (alpha, blue, green, red)
  const map: Record<string, string> = {
    white: '&H00FFFFFF',
    yellow: '&H0000FFFF',
    black: '&H00000000',
    red: '&H000000FF',
  }
  return map[color.toLowerCase()] ?? '&H00FFFFFF'
}

function escapeFilterPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function escapeAssValue(input: string): string {
  // ASS style values cannot contain commas or apostrophes safely.
  return input.replace(/,/g, ' ').replace(/'/g, '')
}

const CJK_FONT_NAME_HINTS = [
  'Noto Sans CJK',
  'Noto Serif CJK',
  'Source Han',
  'WenQuanYi',
  'Microsoft YaHei',
  'SimHei',
  'PingFang',
  'Heiti',
  'Hiragino Sans GB',
]

function hasCjkGlyphs(text: string): boolean {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(text)
}

function buildScalePadFilter(width: string, height: string): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
}

function getBaseH264OutputOptions(preset: string): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    String(FFMPEG_RUNTIME.crf),
    '-threads',
    String(FFMPEG_RUNTIME.threads),
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ]
}

/**
 * Best-effort check for CJK subtitle rendering capability in current runtime.
 * Priority:
 * 1) SUBTITLE_FONT_PATH exists on disk
 * 2) SUBTITLE_FONT_NAME looks like a CJK-capable family
 * 3) System fontconfig lists a known CJK family
 */
export function canRenderCjkSubtitles(): boolean {
  const configuredFontPath = process.env.SUBTITLE_FONT_PATH?.trim()
  if (configuredFontPath && existsSync(configuredFontPath)) return true

  const configuredFontName = process.env.SUBTITLE_FONT_NAME?.trim() || ''
  if (configuredFontName) {
    const lower = configuredFontName.toLowerCase()
    if (CJK_FONT_NAME_HINTS.some((hint) => lower.includes(hint.toLowerCase()))) return true
  }

  try {
    const out = execFileSync('fc-list', [], { encoding: 'utf-8' }).toLowerCase()
    return CJK_FONT_NAME_HINTS.some((hint) => out.includes(hint.toLowerCase()))
  } catch {
    return false
  }
}

export function subtitlesContainCjk(subtitles: SubtitleCue[]): boolean {
  return subtitles.some((cue) => hasCjkGlyphs(cue.text))
}

// ── Narration splitting ──────────────────────────────────────

/**
 * Split a narration string into shorter lines suitable for subtitles and
 * per-line TTS.  Splits on sentence-ending punctuation (. ! ? and CJK
 * equivalents).  If a resulting segment is still longer than `maxChars`,
 * it is further split on comma / clause boundaries.
 */
export function splitNarrationIntoLines(narration: string, maxChars = 60): string[] {
  const trimmed = narration?.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  // Split on sentence-ending punctuation, keeping the punctuation with
  // the preceding text.
  const sentences = trimmed
    .split(/(?<=[.!?。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

  const lines: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      lines.push(sentence)
      continue
    }
    // Further split long sentences on commas / semicolons / clause breaks
    const clauses = sentence
      .split(/(?<=[,;，；、])\s*/)
      .map((c) => c.trim())
      .filter(Boolean)

    let buffer = ''
    for (const clause of clauses) {
      if (buffer && (buffer + ' ' + clause).length > maxChars) {
        lines.push(buffer)
        buffer = clause
      } else {
        buffer = buffer ? buffer + ' ' + clause : clause
      }
    }
    if (buffer) lines.push(buffer)
  }

  return lines.length > 0 ? lines : [trimmed]
}

function stripElevenV3ControlTags(text: string): string {
  return text
    .replace(/\s*\[[A-Za-z][A-Za-z' -]{0,40}\]\s*/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Build the per-line script for a scene: narration split into subtitle-
 * friendly chunks, followed by dialogue lines.
 */
export function buildSceneLines(
  scene: ScriptScene,
  options: { stripVoiceControlTags?: boolean } = {}
): string[] {
  const normalizeLine = (line: string) =>
    options.stripVoiceControlTags ? stripElevenV3ControlTags(line) : line

  return [
    ...splitNarrationIntoLines(scene.narration).map(normalizeLine),
    ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`).map(normalizeLine),
  ].filter(Boolean)
}

// ── Core video operations ────────────────────────────────────

/**
 * Create a video clip from a still image + audio file.
 * Uses libx264 with stillimage tune for optimal quality on static images.
 */
export function createSceneVideoClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  options: { resolution?: string; fps?: number } = {}
): Promise<void> {
  const { resolution = '1280x720', fps = 24 } = options
  const [w, h] = resolution.split('x')
  const videoFilter = buildScalePadFilter(w, h)

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .outputOptions([
        '-vf',
        videoFilter,
        '-r',
        String(fps),
        '-tune',
        'stillimage',
        ...getBaseH264OutputOptions(FFMPEG_RUNTIME.scenePreset),
        '-c:a',
        'aac',
        '-b:a',
        FFMPEG_RUNTIME.audioBitrate,
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg scene clip error: ${err.message}`)))
      .run()
  })
}

/**
 * Create a video clip from multiple still images (frames) + audio file.
 * Splits audio duration equally among frames and crossfades between them.
 * Falls back to single-image behavior if only 1 frame is provided.
 */
export async function createMultiFrameSceneVideoClip(
  imagePaths: string[],
  audioPath: string,
  outputPath: string,
  options: { resolution?: string; fps?: number; crossfadeDuration?: number } = {}
): Promise<void> {
  if (imagePaths.length <= 1) {
    return createSceneVideoClip(imagePaths[0], audioPath, outputPath, options)
  }

  const { resolution = '1280x720', fps = 24, crossfadeDuration = 0.5 } = options
  const [w, h] = resolution.split('x')
  const frameCount = imagePaths.length

  // Get audio duration to calculate per-frame display time
  const audioDurationMs = await getVideoDuration(audioPath)
  const audioDurationSec = audioDurationMs / 1000

  // Each frame gets equal time, accounting for crossfade overlaps
  // Total overlap time = (frameCount - 1) * crossfadeDuration
  // Sum of segment durations = audioDuration + (frameCount - 1) * crossfadeDuration
  const totalOverlap = (frameCount - 1) * crossfadeDuration
  const segmentDuration = (audioDurationSec + totalOverlap) / frameCount
  // Ensure minimum segment duration is at least 2x crossfade
  const safeSegmentDuration = Math.max(segmentDuration, crossfadeDuration * 2 + 0.1)

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()

    // Add each image as a looping input with its segment duration
    for (let i = 0; i < frameCount; i++) {
      cmd.input(imagePaths[i])
      cmd.inputOptions(['-loop 1', `-t ${safeSegmentDuration}`])
    }

    // Add audio input
    cmd.input(audioPath)

    // Build the complex filtergraph:
    // 1. Scale each image to target resolution
    // 2. Apply xfade transitions between consecutive streams
    // 3. Map the final video + audio
    const scaleFilters: string[] = []
    for (let i = 0; i < frameCount; i++) {
      scaleFilters.push(
        `[${i}:v]${buildScalePadFilter(w, h)},setsar=1,fps=${fps}[v${i}]`
      )
    }

    // Chain xfade filters between consecutive streams
    const xfadeFilters: string[] = []
    let prevLabel = 'v0'
    for (let i = 1; i < frameCount; i++) {
      const offset = i * safeSegmentDuration - i * crossfadeDuration
      const safeOffset = Math.max(0, offset)
      const outLabel = i < frameCount - 1 ? `xf${i}` : 'vout'
      xfadeFilters.push(
        `[${prevLabel}][v${i}]xfade=transition=fade:duration=${crossfadeDuration}:offset=${safeOffset.toFixed(3)}[${outLabel}]`
      )
      prevLabel = outLabel
    }

    const filterComplex = [...scaleFilters, ...xfadeFilters].join(';')

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[vout]',
        '-map', `${frameCount}:a`,
        '-r', String(fps),
        '-tune', 'stillimage',
        ...getBaseH264OutputOptions(FFMPEG_RUNTIME.scenePreset),
        '-c:a', 'aac',
        '-b:a', FFMPEG_RUNTIME.audioBitrate,
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg multi-frame clip error: ${err.message}`)))
      .run()
  })
}

/**
 * Concatenate multiple video clips into one.
 * Uses the concat demuxer (stream copy, no re-encoding).
 */
export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 0) throw new Error('No clip paths provided')
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath)
    return
  }

  const concatFile = outputPath + '.concat.txt'
  await fs.writeFile(concatFile, clipPaths.map((p) => `file '${p}'`).join('\n'), 'utf-8')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', async () => {
        await fs.unlink(concatFile).catch(() => {})
        resolve()
      })
      .on('error', async (err) => {
        await fs.unlink(concatFile).catch(() => {})
        reject(new Error(`FFmpeg concat error: ${err.message}`))
      })
      .run()
  })
}

/**
 * V2: Concatenate multiple WAV audio clips into one WAV file.
 * Uses concat demuxer with stream copy (no re-encode).
 */
export async function concatenateAudiosV2(
  audioPaths: string[],
  outputPath: string
): Promise<void> {
  if (audioPaths.length === 0) throw new Error('No audio paths provided')
  if (audioPaths.length === 1) {
    await fs.copyFile(audioPaths[0], outputPath)
    return
  }

  const concatFile = outputPath + '.audio.concat.txt'
  await fs.writeFile(concatFile, audioPaths.map((p) => `file '${p}'`).join('\n'), 'utf-8')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', async () => {
        await fs.unlink(concatFile).catch(() => {})
        resolve()
      })
      .on('error', async (err) => {
        await fs.unlink(concatFile).catch(() => {})
        reject(new Error(`FFmpeg audio concat error: ${err.message}`))
      })
      .run()
  })
}

/**
 * Burn SRT subtitles into a video (re-encodes video stream).
 */
export function burnSubtitles(
  inputPath: string,
  srtPath: string,
  outputPath: string,
  style: { fontSize?: number; color?: string; position?: 'top' | 'bottom' | 'center' } = {}
): Promise<void> {
  const { fontSize = 28, color = 'white', position = 'bottom' } = style
  const marginV = position === 'center' ? 0 : 40
  const alignment = position === 'top' ? 6 : position === 'center' ? 5 : 2
  const assColor = fontColorToAss(color)
  const fontName = escapeAssValue(process.env.SUBTITLE_FONT_NAME || 'Noto Sans CJK SC')
  const fontPath = process.env.SUBTITLE_FONT_PATH?.trim() || ''

  // Escape path for FFmpeg filter
  const escapedSrt = escapeFilterPath(srtPath)
  const fontsDirPart = fontPath ? `:fontsdir='${escapeFilterPath(path.dirname(fontPath))}'` : ''
  const subtitleFilter =
    `subtitles='${escapedSrt}'${fontsDirPart}:charenc=UTF-8:` +
    `force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${assColor},Alignment=${alignment},MarginV=${marginV},Bold=1'`

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .outputOptions([
        '-vf',
        subtitleFilter,
        ...getBaseH264OutputOptions(FFMPEG_RUNTIME.subtitlePreset),
        '-c:a copy',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg subtitle burn error: ${err.message}`)))
      .run()
  })
}

/**
 * Get video duration in milliseconds.
 */
export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err)
      resolve(Math.round((metadata.format.duration ?? 0) * 1000))
    })
  })
}

// ── Subtitle generation ──────────────────────────────────────

/**
 * Write an SRT subtitle file to disk.
 */
export async function writeSrtFile(subtitles: SubtitleCue[], outputPath: string): Promise<void> {
  const content = subtitles
    .map((c) => `${c.index}\n${msToSrtTime(c.startTime)} --> ${msToSrtTime(c.endTime)}\n${c.text}`)
    .join('\n\n')
  await fs.writeFile(outputPath, content, 'utf-8')
}

/**
 * Build subtitle cues from script scenes using actual audio durations.
 * sceneDurationsMs: real audio duration per scene (from getVideoDuration).
 */
export function buildSubtitleCues(
  scenes: ScriptScene[],
  sceneDurationsMs: number[]
): SubtitleCue[] {
  let timeMs = 0
  const cues: SubtitleCue[] = []
  let idx = 1

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const totalMs = sceneDurationsMs[i] ?? scene.estimatedDuration * 1000

    const lines = buildSceneLines(scene, { stripVoiceControlTags: true })

    if (lines.length === 0) {
      timeMs += totalMs
      continue
    }

    const msPerLine = Math.floor(totalMs / lines.length)
    for (const text of lines) {
      cues.push({
        index: idx++,
        startTime: timeMs,
        endTime: timeMs + msPerLine,
        text,
      })
      timeMs += msPerLine
    }
  }
  return cues
}

/**
 * V2: Build subtitle cues from actual line-level audio durations.
 * sceneLineDurationsMs[i][j] matches line j in scene i (narration split
 * into sentences via buildSceneLines()).
 */
export function buildSubtitleCuesV2(
  scenes: ScriptScene[],
  sceneLineDurationsMs: number[][],
  sceneDurationsMsFallback: number[] = []
): SubtitleCue[] {
  let timeMs = 0
  const cues: SubtitleCue[] = []
  let idx = 1

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const lines = buildSceneLines(scene, { stripVoiceControlTags: true })

    if (lines.length === 0) {
      timeMs += sceneDurationsMsFallback[i] ?? scene.estimatedDuration * 1000
      continue
    }

    const providedDurations = sceneLineDurationsMs[i] ?? []
    const fallbackSceneMs = sceneDurationsMsFallback[i] ?? scene.estimatedDuration * 1000
    const knownMs = providedDurations.reduce((sum, d) => sum + (d > 0 ? d : 0), 0)
    const unknownCount = lines.reduce(
      (count, _line, lineIdx) => count + ((providedDurations[lineIdx] ?? 0) > 0 ? 0 : 1),
      0
    )
    const avgUnknownMs = unknownCount > 0
      ? Math.max(1, Math.floor(Math.max(fallbackSceneMs - knownMs, 0) / unknownCount))
      : 0
    const hardFallbackMs = Math.max(1, Math.floor(fallbackSceneMs / lines.length))

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const text = lines[lineIdx]
      const candidateMs = providedDurations[lineIdx] ?? 0
      const durationMs = candidateMs > 0
        ? candidateMs
        : avgUnknownMs > 0
          ? avgUnknownMs
          : hardFallbackMs

      cues.push({
        index: idx++,
        startTime: timeMs,
        endTime: timeMs + durationMs,
        text,
      })
      timeMs += durationMs
    }
  }

  return cues
}
