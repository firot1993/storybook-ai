/**
 * Default PromptProvider — wraps the existing `ai-prompts.ts` helpers so that
 * existing behaviour is preserved when no custom provider is supplied.
 */

import type { PromptProvider } from './types'
import {
  buildSynopsisVersionsPrompt as _synopsis,
  buildCompanionSuggestionsPrompt as _companion,
  buildStoryWithAssetsPrompt as _story,
  buildDirectorScriptPrompt as _director,
  buildInterleavedDirectorScriptPrompt as _interleaved,
  buildChunkedInterleavedDirectorScriptPrompt as _chunked,
  buildCharacterWithStyleRefPrompt as _charStyle,
  buildStoryImagePrompt as _storyImage,
  buildSceneIllustrationPrompt as _sceneIllustration,
  buildVoiceAssignmentPrompt as _voice,
} from '../ai-prompts'

export const defaultPromptProvider: PromptProvider = {
  buildSynopsisVersionsPrompt(p) {
    return _synopsis({ ...p, ageRange: p.audience })
  },
  buildCompanionSuggestionsPrompt(p) {
    return _companion({ ...p, ageRange: p.audience })
  },
  buildStoryWithAssetsPrompt(p) {
    return _story({ ...p, ageRange: p.audience })
  },
  buildDirectorScriptPrompt(p) {
    return _director({ ...p, ageRange: p.audience })
  },
  buildInterleavedDirectorScriptPrompt(p) {
    return _interleaved({ ...p, ageRange: p.audience })
  },
  buildChunkedInterleavedDirectorScriptPrompt(p) {
    return _chunked({ ...p, ageRange: p.audience })
  },
  buildCharacterWithStyleRefPrompt(p) {
    return _charStyle(p.stylePrompt, p.ageDesc)
  },
  buildStoryImagePrompt(p) {
    return _storyImage(p)
  },
  buildSceneIllustrationPrompt(p) {
    return _sceneIllustration(p.imagePrompt)
  },
  buildVoiceAssignmentPrompt(p) {
    return _voice(p)
  },
}
