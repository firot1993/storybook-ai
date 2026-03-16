export type ScriptGenerationProgress = {
  scenesGenerated: number
  totalScenes: number
}

function normalizeProgressValue(value: number | undefined): number {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, Math.trunc(normalized))
}

export function mergeMonotonicScriptProgress(
  previous: ScriptGenerationProgress | null,
  incoming: ScriptGenerationProgress
): ScriptGenerationProgress {
  const totalScenes = Math.max(
    normalizeProgressValue(previous?.totalScenes),
    normalizeProgressValue(incoming.totalScenes)
  )
  const maxScenes = totalScenes > 0 ? totalScenes : Number.MAX_SAFE_INTEGER

  return {
    totalScenes,
    scenesGenerated: Math.max(
      Math.min(normalizeProgressValue(previous?.scenesGenerated), maxScenes),
      Math.min(normalizeProgressValue(incoming.scenesGenerated), maxScenes)
    ),
  }
}
