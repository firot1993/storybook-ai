import type { SceneContext } from '@/types'

export function extractStoryChoices(content: string): string[] {
  const match = content.match(/<!--CHOICES:(.*?)-->/)
  if (!match) return []
  try { return JSON.parse(match[1]) as string[] } catch { return [] }
}

export function normalizeStoryChoices(content: string, maxChoices = 3): string[] {
  return extractStoryChoices(content)
    .map((choice) => choice.trim())
    .filter(Boolean)
    .slice(0, maxChoices)
}

export function buildPreviousStoryExcerpt(content: string, maxChars = 2200): string {
  const storyBody = content.replace(/<!--CHOICES:[\s\S]*?-->/g, '').trim()
  if (!storyBody) return ''
  return storyBody.length > maxChars ? storyBody.slice(-maxChars) : storyBody
}

const SCENE_CONTEXT_PATTERN = /<!--SCENE_CONTEXT:(.*?)-->\n?/g

export function extractSceneContexts(content: string): SceneContext[] {
  const contexts: SceneContext[] = []
  const regex = new RegExp(SCENE_CONTEXT_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as SceneContext
      contexts.push({
        visualTheme: parsed.visualTheme ?? '',
        timeLighting: parsed.timeLighting ?? '',
        keyProp: parsed.keyProp ?? '',
        actionFlow: parsed.actionFlow ?? '',
        characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      })
    } catch {
      // skip malformed context markers
    }
  }
  return contexts
}

export function stripSceneContextMarkers(content: string): string {
  return content.replace(new RegExp(SCENE_CONTEXT_PATTERN.source, 'g'), '')
}

export function splitStoryIntoScenes(content: string): string[] {
  // Strip the choices and scene context markers before parsing scenes
  const normalized = typeof content === 'string'
    ? stripSceneContextMarkers(content.replace(/<!--CHOICES:.*?-->/, '')).trim()
    : ''
  if (!normalized) return []

  // Preferred format from prompts: [Scene 1], [Scene 2], ...
  const markerPattern = /\*{0,2}\[Scene\s*\d+[^\]]*\]\*{0,2}\s*/i
  if (markerPattern.test(normalized)) {
    // Check if there's text before the first [Scene N] marker (a preamble)
    const firstMarkerIndex = normalized.search(markerPattern)
    const hasPreamble = firstMarkerIndex > 0

    const markerScenes = normalized
      .split(/\*{0,2}\[Scene\s*\d+[^\]]*\]\*{0,2}\s*/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    // If there's a preamble before [Scene 1] (e.g. a story title), discard it
    // when it's short (< 80 chars) and at least 2 real scenes follow.
    if (hasPreamble && markerScenes.length >= 3 && markerScenes[0].length < 80) {
      markerScenes.shift()
    }

    if (markerScenes.length > 0) return markerScenes
  }

  // Fallback for malformed model output.
  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
