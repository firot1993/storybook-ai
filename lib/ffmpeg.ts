import ffmpeg from 'fluent-ffmpeg'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import type { SubtitleCue, ScriptScene } from '@/types'

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
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

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .outputOptions([
        `-vf scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
        `-r ${fps}`,
        '-c:v libx264',
        '-tune stillimage',
        '-preset fast',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg scene clip error: ${err.message}`)))
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
        '-c:a copy',
        '-movflags +faststart',
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

    const lines = [
      scene.narration,
      ...scene.dialogue.map((d) => `${d.speaker}: ${d.text}`),
    ].filter(Boolean)

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
