/**
 * Workflow-level types that decouple prompt generation from orchestration.
 *
 * The PromptProvider interface lets callers supply their own prompt templates
 * while keeping the pipeline steps (synopsis → story → director-script → video)
 * unchanged.
 */

import type { Locale } from '../i18n/shared'
import type { SceneContext } from '@/types'

// ── Prompt parameter bags ────────────────────────────────────

export interface SynopsisPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  backgroundKeywords: string
  audience: string
  locale: Locale
  protagonistPronoun?: string
  protagonistRole?: string
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}

export interface CompanionPromptParams {
  protagonistName: string
  backgroundKeywords: string
  audience: string
  locale: Locale
  protagonistPronoun?: string
  protagonistRole?: string
}

export interface StoryWithAssetsPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  synopsis: string
  audience: string
  styleDesc: string
  locale: Locale
  theme?: string
  hasCharacterImageRef: boolean
  referenceCharacterNames?: string[]
  protagonistPronoun?: string
  protagonistRole?: string
  needsSupportingCharacter?: boolean
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}

export interface DirectorScriptPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  storyContent: string
  audience: string
  styleDesc: string
  locale: Locale
  characterPoolText: string
  characterProfileText: string
  minSceneCount: number
  maxSceneCount: number
  protagonistPronoun?: string
  protagonistRole?: string
}

export interface InterleavedDirectorScriptPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  storyContent: string
  audience: string
  styleDesc: string
  locale: Locale
  characterPoolText: string
  sceneCount: number
  protagonistPronoun?: string
  protagonistRole?: string
}

export interface ChunkedInterleavedDirectorScriptPromptParams extends InterleavedDirectorScriptPromptParams {
  startSceneIndex: number
  endSceneIndex: number
  totalScenes: number
  previousSceneSummaries?: string[]
  sceneInputs?: Array<{
    globalSceneNumber: number
    sceneText?: string
    sceneContext?: SceneContext
  }>
}

export interface CharacterStyleRefPromptParams {
  stylePrompt: string
  ageDesc?: string
}

export interface StoryImagePromptParams {
  sceneDescription: string
  hasMultipleReferences: boolean
  multiRefLabel?: string
  textHint: string
}

export interface SceneIllustrationPromptParams {
  imagePrompt: string
}

export interface VoiceAssignmentPromptParams {
  name: string
  age: number | null | undefined
  style: string
  locale: Locale
  availableVoices: Array<{ name: string; tone: string; gender: string; ageRange?: string }>
  pronoun?: string
}

// ── PromptProvider interface ─────────────────────────────────

/**
 * A PromptProvider generates all text prompts consumed by the storybook
 * pipeline.  Swap this to customise tone, audience, language, or domain
 * without touching orchestration code.
 */
export interface PromptProvider {
  buildSynopsisVersionsPrompt(params: SynopsisPromptParams): string
  buildCompanionSuggestionsPrompt(params: CompanionPromptParams): string
  buildStoryWithAssetsPrompt(params: StoryWithAssetsPromptParams): string
  buildDirectorScriptPrompt(params: DirectorScriptPromptParams): string
  buildInterleavedDirectorScriptPrompt(params: InterleavedDirectorScriptPromptParams): string
  buildChunkedInterleavedDirectorScriptPrompt(params: ChunkedInterleavedDirectorScriptPromptParams): string
  buildCharacterWithStyleRefPrompt(params: CharacterStyleRefPromptParams): string
  buildStoryImagePrompt(params: StoryImagePromptParams): string
  buildSceneIllustrationPrompt(params: SceneIllustrationPromptParams): string
  buildVoiceAssignmentPrompt(params: VoiceAssignmentPromptParams): string
}

// ── Workflow configuration ───────────────────────────────────

export interface WorkflowConfig {
  /** Override default prompt templates */
  promptProvider?: PromptProvider
  /** Override the Gemini API key (BYOK) */
  apiKey?: string
  /** Override the text generation model */
  textModel?: string
  /** Override the image generation model */
  imageModel?: string
}
