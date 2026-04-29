/**
 * Barrel export for the workflow module.
 *
 * Usage:
 *   import { defaultPromptProvider, type PromptProvider, type WorkflowConfig } from '@/lib/workflow'
 */

export { defaultPromptProvider } from './default-prompts'
export type {
  PromptProvider,
  WorkflowConfig,
  SynopsisPromptParams,
  CompanionPromptParams,
  StoryWithAssetsPromptParams,
  DirectorScriptPromptParams,
  InterleavedDirectorScriptPromptParams,
  ChunkedInterleavedDirectorScriptPromptParams,
  CharacterStyleRefPromptParams,
  StoryImagePromptParams,
  SceneIllustrationPromptParams,
  VoiceAssignmentPromptParams,
} from './types'
