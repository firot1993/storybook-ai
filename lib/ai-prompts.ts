import { getLocaleLanguageName, type Locale } from './i18n/shared'

interface SynopsisVersionsPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  backgroundKeywords: string
  ageRange: string
  locale: Locale
  protagonistPronoun?: string
  protagonistRole?: string
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}

interface CompanionSuggestionsPromptParams {
  protagonistName: string
  backgroundKeywords: string
  ageRange: string
  locale: Locale
  protagonistPronoun?: string
  protagonistRole?: string
}

interface StoryWithAssetsPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  synopsis: string
  ageRange: string
  styleDesc: string
  locale: Locale
  theme?: string
  hasCharacterImageRef: boolean
  protagonistPronoun?: string
  protagonistRole?: string
  needsSupportingCharacter?: boolean
  previousStoryTitle?: string
  previousStoryContent?: string
  previousStoryChoices?: string[]
}

interface DirectorScriptPromptParams {
  storyName: string
  protagonistName: string
  supportingName: string
  storyContent: string
  ageRange: string
  styleDesc: string
  locale: Locale
  characterPoolText: string
  characterProfileText: string
  minSceneCount: number
  maxSceneCount: number
  protagonistPronoun?: string
  protagonistRole?: string
}

interface StoryImagePromptParams {
  sceneDescription: string
  hasMultipleReferences: boolean
  multiRefLabel?: string
  textHint: string
}

interface VoiceCastingOption {
  name: string
  tone: string
  gender: string
  ageRange?: string
}

interface VoiceAssignmentPromptParams {
  name: string
  age: number | null | undefined
  style: string
  locale: Locale
  availableVoices: VoiceCastingOption[]
}

export const DEFAULT_TRANSCRIBE_AUDIO_HINT =
  'Transcribe the spoken content accurately. Return only the transcribed text, nothing else.'

export const DEFAULT_IMAGE_NEGATIVE_PROMPT =
  'text, watermark, signature, blurry, low quality, ugly, scary, realistic, photo'

export const CHARACTER_CARTOON_NEGATIVE_PROMPT =
  'realistic, photographic, scary, dark, adult content, text, watermark, blurry, 3D render'

export const COMPANION_CARTOON_NEGATIVE_PROMPT =
  'photo, realistic photography, live action, scary, dark, horror, text, watermark'

export const SCENE_ILLUSTRATION_NEGATIVE_PROMPT =
  'text, letters, words, watermark, scary, realistic, photo'

export const DEFAULT_STORY_IMAGE_REFERENCE_HINT =
  'Keep the character appearances consistent across all scenes.'

const DEFAULT_STORY_STYLE_LABEL = 'dreamlike watercolor, macaron palette, warm soft light'
const DEFAULT_DIRECTOR_STYLE_LABEL = 'warm 2D anime style'

function dedentPrompt(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')
  const lines = normalized.split('\n')
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0)
  const margin = indents.length > 0 ? Math.min(...indents) : 0
  return lines
    .map((line) => line.slice(margin))
    .join('\n')
    .trim()
}

function formatProtagonistLabel(name: string, pronoun?: string, role?: string): string {
  const parts = [pronoun, role].filter(Boolean)
  return parts.length > 0 ? `${name} (${parts.join(', ')})` : name
}

function getTitleLengthInstruction(locale: Locale): string {
  return locale === 'zh' ? '4-6 Chinese characters' : '2-5 words'
}

function getCompanionDescriptionInstruction(locale: Locale): string {
  return locale === 'zh' ? 'within 15 Chinese characters' : 'within 3-8 words'
}

function getNpcDescriptionInstruction(locale: Locale): string {
  return locale === 'zh' ? 'within 20 Chinese characters' : 'within 6-12 words'
}

function getChoiceLengthInstruction(locale: Locale): string {
  return locale === 'zh' ? 'within 15 Chinese characters' : 'within 2-6 words'
}

function getOutputLanguageRequirement(locale: Locale, scope: string): string {
  return `${scope} must be written in ${getLocaleLanguageName(locale)}.`
}

function buildAgeInstruction(ageDesc = ''): string {
  const ageNum = ageDesc ? parseInt(ageDesc, 10) : Number.NaN

  if (Number.isNaN(ageNum) || ageNum <= 0) return ''

  if (ageNum <= 3) {
    return (
      `IMPORTANT - The character is ${ageNum} years old. ` +
      `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
      `Only adjust the overall head-to-body proportion to match a toddler: larger head relative to body, shorter limbs. ` +
      `Do NOT add generic "big eyes" or "chubby cheeks" that do not exist in the photo.`
    )
  }

  if (ageNum <= 6) {
    return (
      `IMPORTANT - The character is ${ageNum} years old. ` +
      `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
      `Only adjust the overall proportion to match a young child: slightly larger head relative to body, soft skin texture. ` +
      `Do NOT impose generic child features - keep the actual person's facial structure.`
    )
  }

  return (
    `IMPORTANT - The character is ${ageNum} years old. ` +
    `Faithfully extract the facial features (eye shape, eye size, face shape, face fat/thin ratio, nose shape) from the USER PHOTO and preserve them. ` +
    `Adjust the overall proportion to match a child of this age. ` +
    `Do NOT impose generic child features - keep the actual person's facial structure.`
  )
}

export function buildCharacterWithStyleRefPrompt(stylePrompt: string, ageDesc = ''): string {
  const ageInstruction = buildAgeInstruction(ageDesc)
  const ageBlock = ageInstruction ? `${ageInstruction}\n` : ''

  return dedentPrompt(`
    [Character Reconstruction Task]
    Image 1 is the STYLE REFERENCE. Image 2 is the USER PHOTO.

    ${ageBlock}Requirements:
    1. Extract facial features (eye shape, eye size, face shape, fat/thin ratio, nose, lips) from the USER PHOTO (Image 2) and faithfully preserve them in the illustration. Also extract hairstyle, hair color, eye color, skin tone.
    2. Fully reconstruct the character in the hand-drawn artistic style shown in Image 1.
    3. Hand-drawn style emphasis: ${stylePrompt}
    4. Apply gentle anime or picture-book stylization. Line art should stay 2D and avoid realistic texture.
    5. Use flat-style shadow lighting: avoid realistic gradients and create depth through clearly defined cartoon shadow shapes.
    6. Convey an overall warm, breathable children's picture-book quality.

    Output: upper-body front-facing portrait, centered composition, clean simple background, friendly smile.
  `)
}

export function buildSynopsisVersionsPrompt(params: SynopsisVersionsPromptParams): string {
  const {
    storyName,
    protagonistName,
    supportingName,
    backgroundKeywords,
    ageRange,
    locale,
    protagonistPronoun,
    protagonistRole,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  } = params
  const continuationChoices = (previousStoryChoices ?? [])
    .map((choice) => choice.trim())
    .filter(Boolean)
    .join(locale === 'zh' ? '、' : ', ')
  const continuationContextBlock = previousStoryContent?.trim()
    ? dedentPrompt(`
        [Continuation Context]
        Previous episode title: ${previousStoryTitle || '(untitled)'}
        Previous episode excerpt:
        ${previousStoryContent.trim()}
        Previous end-of-episode choices: ${continuationChoices || 'N/A'}

        Continuation requirements:
        1. Keep world-state and character continuity with the previous episode.
        2. Treat "Core elements" as the selected branch direction for this next episode.
        3. Do not reset the story from an unrelated beginning.
      `)
    : ''

  return dedentPrompt(`
    [System Role]
    You are a world-renowned children's picture-book author. Your stories blend gentle wonder, rich sensory detail, and a warm emotional core suitable for young readers.

    [Creative Task]
    Based on the story parameters below, generate three distinct story outline versions for a children's storybook.

    Requirements:
    1. Each version should be brief and vivid, roughly one short paragraph.
    2. Structure each version as: calm beginning + magical exploration + warm healing ending.
    3. Use sensory language children can imagine easily.
    4. Make the three versions meaningfully different:
       - A: sensory wonder and environment
       - B: emotional interaction and companionship
       - C: courage, challenge, and recovery
    5. ${getOutputLanguageRequirement(locale, 'All title and content values')}

    [Story Parameters]
    Story title: ${storyName}
    Protagonist: ${formatProtagonistLabel(protagonistName, protagonistPronoun, protagonistRole)}
    Supporting character: ${supportingName}
    Core elements: ${backgroundKeywords}
    Target reader age: ${ageRange}
    ${continuationContextBlock}

    [Output Format]
    Return strict JSON only. No markdown, no extra commentary.
    {
      "A": {"title": "Short title (${getTitleLengthInstruction(locale)})", "content": "Version A outline"},
      "B": {"title": "Short title (${getTitleLengthInstruction(locale)})", "content": "Version B outline"},
      "C": {"title": "Short title (${getTitleLengthInstruction(locale)})", "content": "Version C outline"}
    }
  `)
}

export function buildCompanionSuggestionsPrompt(params: CompanionSuggestionsPromptParams): string {
  const { protagonistName, backgroundKeywords, ageRange, locale, protagonistPronoun, protagonistRole } = params

  return dedentPrompt(`
    You are a children's story development expert.
    Recommend 3 lovable adventure companions for the protagonist below. They may be animals, magical creatures, or other child-friendly fantasy companions.

    Protagonist: ${formatProtagonistLabel(protagonistName, protagonistPronoun, protagonistRole)}
    Story elements: ${backgroundKeywords}
    Target reader age: ${ageRange}

    Requirements:
    1. Each companion should feel distinct and memorable.
    2. Keep them age-appropriate, whimsical, and easy to visualize.
    3. ${getOutputLanguageRequirement(locale, 'Each name and description')}
    4. Each description should be very short, ${getCompanionDescriptionInstruction(locale)}.

    Return strict JSON only. No markdown, no extra commentary.
    [
      {"emoji": "🐱", "name": "Companion name", "description": "Short description"},
      {"emoji": "🦋", "name": "Companion name", "description": "Short description"},
      {"emoji": "🐉", "name": "Companion name", "description": "Short description"}
    ]
  `)
}

export function buildStoryWithAssetsPrompt(params: StoryWithAssetsPromptParams): string {
  const {
    storyName,
    protagonistName,
    supportingName,
    synopsis,
    ageRange,
    styleDesc,
    locale,
    theme,
    hasCharacterImageRef,
    protagonistPronoun,
    protagonistRole,
    needsSupportingCharacter,
    previousStoryTitle,
    previousStoryContent,
    previousStoryChoices,
  } = params
  const styleLabel = styleDesc || DEFAULT_STORY_STYLE_LABEL
  const themeLabel = theme || 'exploration and friendship'
  const continuationChoices = (previousStoryChoices ?? [])
    .map((choice) => choice.trim())
    .filter(Boolean)
    .join(locale === 'zh' ? '、' : ', ')
  const continuationContextBlock = previousStoryContent?.trim()
    ? dedentPrompt(`
        [Continuation Context]
        Previous episode title: ${previousStoryTitle || '(untitled)'}
        Previous episode excerpt:
        ${previousStoryContent.trim()}
        Previous end-of-episode choices: ${continuationChoices || 'N/A'}

        Continuation requirements:
        1. This episode must directly continue from the previous episode's ending.
        2. Treat "Synopsis seed" as the chosen branch while preserving continuity.
        3. Do not restart the story from scratch.
      `)
    : ''

  return dedentPrompt(`
    [System Role]
    You are a world-renowned children's storybook creator who can generate both text and illustrations in one coordinated response.

    [Story Parameters]
    Story title: ${storyName}
    Protagonist: ${formatProtagonistLabel(protagonistName, protagonistPronoun, protagonistRole)}
    Supporting character: ${supportingName}
    Synopsis seed: ${synopsis}
    Target reader age: ${ageRange}
    Visual style: ${styleLabel}
    Core theme: ${themeLabel}
    ${continuationContextBlock}

    [Output Requirements]
    Produce the response in this exact order:

    [STORY BODY]
    Write a short fairy tale based on the parameters above.
    Requirements:
    1. Use sensory writing instead of generic adjectives.
    2. Add short, warm dialogue using "Name: dialogue" format.
    3. Keep the emotional core centered on ${themeLabel}.
    4. Structure the story as a quiet beginning, magical turning point, and warm healing ending.
    5. End with an open hook that invites imagination or leads naturally to the next episode.
    6. Mark natural scene breaks with [Scene 1], [Scene 2], and so on. Use 3 to 4 scenes total.
    7. ${getOutputLanguageRequirement(locale, 'All story prose, dialogue, NPC descriptions, and choice text')}
    8. If the story introduces any NEW named character other than the protagonist or supporting character, list them as NPCs.
    ${needsSupportingCharacter ? `
    [Supporting Character Invention]
    The supporting character slot is currently unnamed. You MUST invent a memorable, named supporting character for the story (an animal, magical creature, or child-friendly fantasy companion).
    - Give them a proper name (not "Companion" or generic labels).
    - Weave them naturally into the story as the protagonist's companion.
    - Immediately after the story body, output this marker on its own line:
    <!--SUPPORTING:{"name":"<invented character name>","description":"<short visual traits, ${getCompanionDescriptionInstruction(locale)}>"}-->
    - Then generate a full-body portrait for this character in the [CHARACTER - <Name>] section below (same as NPCs).
    - Do NOT list this invented supporting character in the NPCS marker.
    ` : ''}
    Immediately after the story body${needsSupportingCharacter ? ' and the SUPPORTING marker' : ''}, output these two markers exactly as written, one per line:
    <!--NPCS:[{"name":"<new character name>","description":"<short traits, ${getNpcDescriptionInstruction(locale)}>"}]-->
    <!--CHOICES:["<next-episode choice 1, ${getChoiceLengthInstruction(locale)}>","<choice 2, ${getChoiceLengthInstruction(locale)}>","<choice 3, ${getChoiceLengthInstruction(locale)}>"]-->
    If there are no new NPCs, return [] for NPCS.

    Then, ${needsSupportingCharacter ? 'for the invented supporting character AND ' : ''}for each NPC listed in NPCS, output:
    [CHARACTER - <Character Name>]
    Name: <Character Name>
    Personality: <brief personality note>
    Appearance: <brief appearance note>
    Then generate that character as a full-body portrait in ${styleLabel} style with a clean white background.
    ${getOutputLanguageRequirement(locale, 'The Personality and Appearance lines')}

    IMPORTANT: Output each NPC one at a time — write the [CHARACTER - Name] header, then immediately generate that character's portrait image, before moving to the next NPC or the [COVER] section. Do NOT output all character headers first and then all images.

    Finally output:
    [COVER]
    Generate the cover image for this storybook. Use a vertical composition with an approximate 3:4 aspect ratio, ${styleLabel} style, and show the story's core emotional scene. Do not include any text in the image.

    Keep the section headers exactly as written: [STORY BODY], [CHARACTER - <Character Name>], and [COVER].
    ${hasCharacterImageRef ? `

    [Protagonist Consistency Constraint]
    You will receive a reference image for the protagonist "${protagonistName}".
    In every image that includes the protagonist, keep the protagonist visually consistent:
    - same face shape, hairstyle, hair color, main outfit colors, and overall temperament
    - do not treat the protagonist reference as an NPC
    - do not change the protagonist's species or gender unless the story explicitly requires it` : ''}
  `)
}

export function buildProtagonistReferencePrompt(protagonistName: string): string {
  return (
    `Reference image below is the protagonist "${protagonistName}". ` +
    `Use it to keep protagonist appearance consistent in cover and scene-related outputs. ` +
    `Do not use it as an NPC reference.`
  )
}

export function buildReferenceImageLabel(name: string): string {
  return `Reference image for ${name}:`
}

export function buildCharacterNamesReference(characterNames: string[]): string {
  const names = characterNames.map((name) => name.trim()).filter(Boolean)
  return names.length > 0 ? `Characters: ${names.join(', ')}` : ''
}

export function buildDirectorScriptPrompt(params: DirectorScriptPromptParams): string {
  const {
    storyName,
    protagonistName,
    supportingName,
    storyContent,
    ageRange,
    styleDesc,
    locale,
    characterPoolText,
    characterProfileText,
    minSceneCount,
    maxSceneCount,
    protagonistPronoun,
    protagonistRole,
  } = params
  const roleList = [protagonistName, supportingName]
    .map((name) => name.trim())
    .filter(Boolean)
    .join(', ')
  const styleLabel = styleDesc || DEFAULT_DIRECTOR_STYLE_LABEL
  const englishStyleLabel = styleDesc || DEFAULT_DIRECTOR_STYLE_LABEL

  return dedentPrompt(`
    [System Role]
    You are an elite children's animation director and storyboard designer. You transform warm fairy tales into visually rich, emotionally clear animated storyboards with strong pacing.

    [Creative Task]
    Design a storyboard with ${minSceneCount}-${maxSceneCount} scenes based on the parameters below.

    Core rules:
    1. Each scene should support roughly 8-12 seconds of animation and avoid static staging.
    2. Use concrete, visual language instead of abstract wording.
    3. Clearly specify shot type, camera movement, and action focus.
    4. Keep the emotional interaction child-friendly and age-appropriate for ${ageRange}-year-old viewers.
    5. Maintain a consistent visual style: ${styleLabel}.
    6. Ensure opening frames connect visually from one scene to the next.
    7. If charactersUsed is non-empty, every frame prompt must explicitly include all charactersUsed names.
    8. ${getOutputLanguageRequirement(locale, 'sceneDescription, cameraDesign, animationAction, voiceOver, and dialogue text values')}
    9. openingFramePrompt, midActionFramePrompt, and endingFramePrompt must always stay in English for downstream image generation.

    [Story Parameters]
    Story title: ${storyName}
    Main roles: ${formatProtagonistLabel(protagonistName, protagonistPronoun, protagonistRole)}, ${supportingName}
    Available character pool: ${characterPoolText || roleList}
    Character notes:
    ${characterProfileText || 'None'}
    Story text:
    ${storyContent}
    Target audience age: ${ageRange}

    [Output Format]
    Return strict JSON only. No markdown and no extra commentary.
    [
      {
        "index": 1,
        "sceneDescription": "Short scene description",
        "cameraDesign": "Shot type, camera movement, and focus",
        "animationAction": "Detailed character and environment action for the scene",
        "voiceOver": "Rhythmic, read-aloud-friendly narration",
        "dialogue": [{"speaker": "Character name", "text": "Short warm line"}],
        "charactersUsed": ["Character names visible in this scene"],
        "estimatedDuration": 10,
        "openingFramePrompt": "16:9 children's anime illustration, ${englishStyleLabel}: [opening frame - establishing shot with visual continuity from previous scene, character positions, lighting, atmosphere, NO text]",
        "midActionFramePrompt": "16:9 children's anime illustration, ${englishStyleLabel}: [peak action or emotional climax moment of the scene, highest energy, NO text]",
        "endingFramePrompt": "16:9 children's anime illustration, ${englishStyleLabel}: [scene completion state, calm after action, leaving a visual hook for the next scene, NO text]"
      }
    ]
  `)
}

export function buildStoryImagePrompt(params: StoryImagePromptParams): string {
  const { sceneDescription, hasMultipleReferences, multiRefLabel = '', textHint } = params

  return dedentPrompt(`
    Simple children's picture-book illustration for ages 4-8: ${sceneDescription}.
    Style: bright happy colors, round friendly shapes, very simple background, cozy and warm like a bedtime story book. No text in the image.
    IMPORTANT: ${
      hasMultipleReferences
        ? `The characters in this scene MUST look exactly like the characters shown in the reference images.${multiRefLabel} Keep the same face, hair, colors, outfit, and style for each character.`
        : 'The main character in this scene MUST look exactly like the character shown in the reference image. Keep the same face, hair, colors, outfit, and style.'
    } ${textHint}
  `)
}

export function buildVoiceAssignmentPrompt(params: VoiceAssignmentPromptParams): string {
  const { name, age, style, locale, availableVoices } = params
  const voiceList = availableVoices
    .map((voice) => `- ${voice.name}: ${voice.tone} (${voice.gender})`)
    .join('\n')
  const ageDesc = age != null ? `Age: ${age} years old` : 'Age: unknown'

  return dedentPrompt(`
    You are casting a voice actor for a children's storybook character aged 5-8.

    Character info:
    - Name: ${name || 'Unnamed character'}
    - ${ageDesc}
    - Art style: ${style || 'cartoon'}

    Available voices:
    ${voiceList}

    Choose the single best-fitting voice.
    Write the "reason" in ${getLocaleLanguageName(locale)}.
    Respond with valid JSON only:
    {"voiceName": "VoiceName", "reason": "One sentence explaining why this voice fits."}
  `)
}

export function buildExtractCharacterInfoPrompt(transcript: string): string {
  return dedentPrompt(`
    From this voice input, extract the character's name and description.

    Voice input: "${transcript}"

    Preserve the original spoken language in the extracted text values.
    Return ONLY valid JSON with no markdown:
    {"name": "name or null", "description": "description or null"}
  `)
}

export function buildCharacterCartoonPrompt(
  description: string,
  style = 'cute cartoon character',
  hasPhotoReference = false
): string {
  if (hasPhotoReference) {
    return (
      `Character reconstruction: extract the core facial features and hairstyle from this photo, ` +
      `then rebuild the character in a hand-drawn children's picture-book style. ` +
      `Style: ${style}. ${description ? `Character details: ${description}.` : ''} ` +
      `Emphasize hand-drawn texture with flat-style shadow lighting. ` +
      `Maintain the person's distinguishing facial features with gentle anime or picture-book stylization. ` +
      `Warm, breathable artistic atmosphere. Upper-body portrait, centered, clean simple background, friendly expression.`
    )
  }

  return (
    `Children's picture-book illustration: ${description}. ` +
    `Style: ${style}. Hand-drawn texture, flat-style shadows, warm and breathable artistic feel, ` +
    `upper-body portrait, centered, clean simple background, friendly expression.`
  )
}

export function buildCompanionCharacterCartoonPrompt(
  name: string,
  description: string,
  style = 'cute cartoon character'
): string {
  const safeName = (name || '').trim().slice(0, 40) || 'Companion'
  const safeDescription = (description || '').trim().slice(0, 200) || 'friendly magical companion'

  return (
    `Children's picture-book companion character design. ` +
    `Character name: ${safeName}. Character traits: ${safeDescription}. ` +
    `Style: ${style}. ` +
    `Character type should match the name semantics: if the name or description suggests a child or person, draw a human child; ` +
    `if it suggests an animal, spirit, object, or fantasy creature, draw a non-human companion. ` +
    `Do not force a fixed species when the name already implies one. ` +
    `Cute, warm, friendly, storybook look. ` +
    `Centered portrait, clean simple background, clear silhouette, no text.`
  )
}

export function buildSceneIllustrationPrompt(imagePrompt: string): string {
  return `Children's picture-book illustration, ages 4-8: ${imagePrompt}. Style: bright happy colors, round friendly shapes, simple background, cozy and warm. No text in the image.`
}
