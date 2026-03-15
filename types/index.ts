// ── Core entities ────────────────────────────────────────────

export interface StorybookCharacter {
  id: string
  /** Direct name for AI-suggested companions that have no Character record (id will be '') */
  name?: string
  role: 'protagonist' | 'supporting'
  /** Optional short traits/description for AI-generated NPC entries */
  description?: string
  /** Marks dynamically discovered story NPCs persisted on the storybook */
  isNpc?: boolean
  /** Per-storybook pronoun override (e.g. "he/him", "she/her", or custom) */
  pronoun?: string
  /** Per-storybook character role override (e.g. "explorer", "dreamer") */
  characterRole?: string
}

export interface Storybook {
  id: string
  name: string
  ageRange: '2-4' | '4-6' | '6-8'
  styleId: string
  characters: StorybookCharacter[]
  createdAt: Date
  updatedAt: Date
  chapters?: Story[]
}

/** 三版梗概（A/B/C）中的单个版本 */
export interface SynopsisOption {
  version: 'A' | 'B' | 'C'
  label: string   // e.g. "感官体验型"
  title: string   // short title ~5-8 chars
  content: string
}

/** AI 推荐的冒险小伙伴 */
export interface CompanionSuggestion {
  emoji: string
  name: string
  description: string
}

/** 分镜（Scene）— 属于一个 Story */
export interface Scene {
  id: string
  storyId: string
  index: number
  script: string
  imageUrl: string
  lastFrame: string
  videoUrl: string
  status: 'pending' | 'img_gen' | 'vid_gen' | 'done' | 'failed'
  createdAt: Date
  updatedAt: Date
}

export interface Character {
  id: string
  name: string
  originalImage: string
  cartoonImage: string
  /** JSON map of styleId → data URL for all 5 generated style variants */
  styleImages?: Record<string, string>
  style: string
  age?: number
  voiceName: string
  /** Pronoun string, e.g. "he/him", "she/her", or custom text */
  pronoun: string
  /** Character role/personality, e.g. "explorer", "curious dreamer" */
  role: string
  createdAt: Date
}

export interface Story {
  id: string
  storybookId?: string
  synopsisId?: string
  characterIds: string[]
  title: string
  synopsis: string       // selected synopsis text (A/B/C)
  content: string
  mainImage: string      // first scene image (style reference)
  status: 'draft' | 'generating' | 'complete'
  images: string[]
  audioUrl: string
  sceneAudioUrls?: string[]
  createdAt: Date
  updatedAt: Date
}

// ── Scene Context (embedded in story for parallel director script generation) ──

export interface SceneContext {
  visualTheme: string
  timeLighting: string
  keyProp: string
  actionFlow: string
  characters: string[]
}

// ── Script ───────────────────────────────────────────────────

export interface ScriptDialogueLine {
  speaker: string
  text: string
}

export interface ScriptScene {
  index: number
  title: string
  narration: string
  dialogue: ScriptDialogueLine[]
  imagePrompt: string
  /** Names of characters that should appear in this scene. */
  charactersUsed?: string[]
  /** Director-mode: 3 image prompts [opening, midAction, ending] per storyboard scene */
  imagePrompts?: string[]
  estimatedDuration: number  // seconds
  imageUrl?: string
  audioUrl?: string
  videoClipUrl?: string
}

/**
 * Full anime-director storyboard scene produced by generateStorybookDirectorScript().
 * Stored in Script.scenesJson; compatible with ScriptScene (narration, dialogue, etc. are mapped).
 */
export interface DirectorStoryboardScene extends ScriptScene {
  sceneDescription: string   // 场景描述 (time / location / atmosphere)
  cameraDesign: string       // 镜头设计 (shot type + camera movement)
  animationAction: string    // 动画动作 8s
}

export interface Script {
  id: string
  storyId: string
  scenes: ScriptScene[]
  totalDuration: number
  createdAt: Date
}

// ── Video ────────────────────────────────────────────────────

export interface SubtitleCue {
  index: number
  startTime: number  // ms
  endTime: number    // ms
  text: string
}

export type VideoProjectStatus =
  | 'pending'
  | 'generating_images'
  | 'generating_audio'
  | 'composing'
  | 'editing'
  | 'adding_subtitles'
  | 'complete'
  | 'failed'

export interface VideoSettings {
  resolution: '1280x720' | '1080x1080' | '1920x1080'
  fps: 24 | 30
  transitionType: 'fade' | 'cut'
  subtitleStyle: {
    fontSize: number
    color: string
    position: 'top' | 'bottom' | 'center'
  }
}

export interface VideoProject {
  id: string
  storyId: string
  scriptId: string
  status: VideoProjectStatus
  progress: number
  sceneVideoUrls: string[]
  rawVideoUrl: string
  subtitles: SubtitleCue[]
  finalVideoUrl: string
  errorMessage?: string
  videoSettings: Partial<VideoSettings>
  createdAt: Date
  updatedAt: Date
}

// ── Voice ────────────────────────────────────────────────────

export interface TranscribeResponse {
  transcript: string
  confidence?: number
  characterInfo?: {
    name?: string
    description?: string
  }
}

// ── API requests ─────────────────────────────────────────────

export interface GenerateCharacterRequest {
  imageBase64?: string
  description?: string
  name?: string
  style?: string
}

export interface GenerateCharacterResponse {
  character: Character
}

export interface StartVideoRequest {
  scriptId: string
  storyId: string
  videoSettings?: Partial<VideoSettings>
}
