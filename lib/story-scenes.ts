export function extractStoryChoices(content: string): string[] {
  const match = content.match(/<!--CHOICES:(.*?)-->/)
  if (!match) return []
  try { return JSON.parse(match[1]) as string[] } catch { return [] }
}

export function splitStoryIntoScenes(content: string): string[] {
  // Strip the choices marker before parsing scenes
  const normalized = typeof content === 'string'
    ? content.replace(/<!--CHOICES:.*?-->/, '').trim()
    : ''
  if (!normalized) return []

  // Preferred format from prompts: [Scene 1], [Scene 2], ...
  const markerScenes = normalized
    .split(/\*{0,2}\[Scene\s*\d+[^\]]*\]\*{0,2}\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (markerScenes.length > 0) return markerScenes

  // Fallback for malformed model output.
  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
