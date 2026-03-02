// ── Core entities ────────────────────────────────────────────

export interface StorybookCharacter {
  id: string
  /** Direct name for AI-suggested companions that have no Character record (id will be '') */
  name?: string
  role: 'protagonist' | 'supporting'
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
  createdAt: Date
}

export interface StoryOption {
  title: string
  description: string
}

export interface Synopsis {
  id: string
  characterIds: string[]
  theme: string
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  content: string
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
  estimatedDuration: number  // seconds
  imageUrl?: string
  audioUrl?: string
  videoClipUrl?: string
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

export interface GenerateSynopsisRequest {
  characterIds: string[]
  characterNames: string[]
  theme: string
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  relationship?: string
}

export interface GenerateStoryOptionsRequest {
  synopsisId?: string
  characterIds?: string[]
  characterNames: string[]
  keywords: string
  ageGroup: '2-4' | '4-6' | '6-8'
  relationship?: string
}

export interface GenerateStoryOptionsResponse {
  options: StoryOption[]
}

export interface GenerateStoryRequest {
  synopsisId?: string
  characterIds?: string[]
  characterNames: string[]
  characterImages?: string[]
  optionIndex: number
  optionTitle?: string
  optionDescription?: string
  keywords?: string
  ageGroup?: '2-4' | '4-6' | '6-8'
  relationship?: string
}

export interface GenerateStoryResponse {
  story: Story
}

export interface GenerateScriptRequest {
  storyId: string
  characterNames: string[]
}

export interface StartVideoRequest {
  scriptId: string
  storyId: string
  videoSettings?: Partial<VideoSettings>
}
