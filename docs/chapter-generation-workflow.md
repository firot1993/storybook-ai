# Chapter Generation Workflow

## Data Flow Summary

```
User Photo
  ↓
  ↓  generateCharacterWithStyleRef() × 5 [IMAGE_MODEL, image only] (parallel)
  ↓
Protagonist portraits (5 style variants) + Character record
  ↓
  ↓  generateCompanionSuggestions() [TEXT_MODEL, text only]
  ↓
3 companion suggestions → user picks / names companions
  ↓
  ↓  generateCompanionCharacterCartoon() [Banana primary, Gemini IMAGE_MODEL fallback] (per companion)
  ↓
Storybook created (protagonist + companion entries saved)
  ↓
Keywords
  ↓
  ↓  generateSynopsisVersions() [TEXT_MODEL, text only]
  ↓
3 Synopses (A/B/C)
  ↓
  ↓  (user picks one)
  ↓
  ↓  generateStoryWithAssets() [IMAGE_MODEL, text+image interleaved]
  ↓
Story text + cover + NPC/supporting portraits + choices
  ↓  (New character entries are linked to the storybook; Character records are only created when a portrait image is successfully mapped)
  ↓
  ↓  generateInterleavedDirectorScript() [IMAGE_MODEL, text+image interleaved]
  ↓  (fallback: generateStorybookDirectorScript() [TEXT_MODEL, text only])
  ↓
Director script + scene images (all-or-partial)
  ↓
  ├─ Images: use pre-generated from interleaved call
  │          ↳ missing scenes only: generateSceneIllustration() [Banana primary, Gemini IMAGE_MODEL fallback]
  ├─ Audio:  TTS per line [Gemini TTS]
  ├─ Clips:  FFmpeg (image + audio → mp4)
  ├─ Concat: FFmpeg (merge clips)
  └─ Subs:   FFmpeg (burn subtitles)
  ↓
Final video
```

## Phase 1: Storybook Setup (one-time)

Before any chapter is created, the user sets up a **Storybook** — the container for all episodes.

### 1. Protagonist character creation

→ `POST /api/character`

User uploads a reference photo. The system generates cartoon portraits in all 5 art styles in parallel.

- **Model:** `IMAGE_MODEL` (gemini-3.1-flash-image-preview)
- **Modalities:** Image output only (default image generation, no `responseModalities` config)
- **Input parts:** text prompt + style reference image (`/public/style-refs/style{N}.jpg`) + user photo (2 inline images)
- **Prompt:** `buildCharacterWithStyleRefPrompt()` — instructs Gemini to extract facial features (eye shape, face shape, nose, lips, hairstyle, hair color, skin tone) from the user photo and reconstruct in the art style of the reference image. Age-aware: adjusts head-to-body proportions for toddlers (≤3), young children (≤6), and older kids.
- **Output:** Single image per call, compressed via `sharp` to 768px JPEG at 80% quality
- **Parallelism:** 5 calls run in parallel via `Promise.all()`, one per style

**5 art styles** (defined in `lib/styles.ts`):

| Style ID | Label | Reference Image |
|----------|-------|-----------------|
| ghibli | 吉卜力 | /style-refs/style1.jpg |
| watercolor | 水彩童话 | /style-refs/style2.jpg |
| plush3d | 3D 可爱 | /style-refs/style3.jpg |
| claymation | 黏土动画 | /style-refs/style4.jpg |
| pencil | 彩铅绘本 | /style-refs/style5.jpg |

Results are stored as a `styleImages` map on the Character record:
```json
{
  "ghibli": "data:image/jpeg;base64,...",
  "watercolor": "data:image/jpeg;base64,...",
  "plush3d": "data:image/jpeg;base64,...",
  "claymation": "data:image/jpeg;base64,...",
  "pencil": "data:image/jpeg;base64,..."
}
```

The primary `cartoonImage` is set to `styleImages[requestedStyleId]` when that style succeeded, otherwise the first successfully generated style is used.

### 2. Pick art style

User chooses one of the 5 styles. No API call — stored in frontend state.

### 3. Companion suggestions

→ `POST /api/companions/suggest`

- **Model:** `TEXT_MODEL` (gemini-3-flash-preview)
- **Modalities:** Text only
- **Route input:** `protagonistId`, optional `backgroundKeywords`, `ageRange`, `locale`
- **Prompt input:** Resolved protagonist name/pronoun/role, background keywords, age range
- **Output:** JSON array of 3 `CompanionSuggestion` objects: `[{"emoji":"🐱","name":"...","description":"..."}]`
- **Parsing:** `safeParseJsonArray()` — strips markdown fences, finds first `[...]` block, fixes trailing commas

No Character records are created yet — these are name suggestions only.

### 4. Name the book, pick age range (2-4 / 4-6 / 6-8)

### 5. Create storybook

→ `POST /api/storybook`

For each supporting character without an existing Character record (AI-suggested companions with `id: ""`):
- Generates a cartoon portrait via `generateCompanionCharacterCartoon()` in `lib/banana-img.ts`
- **Model:** Banana image generation (configured by `BANANA_MODEL_KEY`), with Gemini `IMAGE_MODEL` as fallback
- **Prompt:** `buildCompanionCharacterCartoonPrompt()` — the current call site passes the character name, a generic `"Friendly supporting companion in a children's story."` description, and the selected style prompt. The prompt builder still infers human/animal/fantasy presentation from name/description semantics.
- Creates a Character record with `cartoonImage` and `styleImages: { [styleId]: dataUrl }` when generation succeeds
- Links the new Character ID back to the StorybookCharacter entry

If supporting-character image generation fails, the storybook entry is still saved, but it remains unlinked with `id: ""`.

Saves the Storybook with protagonist plus supporting entries. Successfully generated companions are linked to Character records; failed generations stay as unlinked named entries.

### Character data model

```typescript
// Database record
Character {
  id, name, originalImage, cartoonImage,
  styleImages: Record<string, string>,  // all 5 style variants
  style, age, voiceName, pronoun, role,
  createdAt
}

// JSON within Storybook.characters array
StorybookCharacter {
  id: string           // Character ID, or "" for unlinked
  role: 'protagonist' | 'supporting'
  name?: string        // direct name for AI-suggested companions
  description?: string // traits for NPCs
  isNpc?: boolean      // true if discovered during story generation
  pronoun?: string     // per-storybook override
  characterRole?: string // per-storybook override
}
```

## Phase 2: Story Generation

### Step 1 — Synopsis generation

User enters background keywords (theme, setting). If continuing from a previous episode, the previous story's ending choices are loaded and the selected background keywords must match one of those choices.

→ `POST /api/storybook/{id}/synopsis` → `generateSynopsisVersions()`

- **Model:** `TEXT_MODEL` (gemini-3-flash-preview)
- **Modalities:** Text only
- **Route input:** `backgroundKeywords` (required), optional `storyName`, `ageRange`, `fromStoryId`, `locale`
- **Prompt input:** Single text prompt with story name, protagonist (with pronoun/role label), supporting character, keywords, age range. If continuing, includes previous story excerpt + ending choices.
- **Output format:** Strict JSON object — `{"A":{"title":"...","content":"..."},"B":{...},"C":{...}}`
- **Parsing:** `safeParseJsonObject()` with regex fallback if JSON parse fails
- **Locale-aware:** Title length instruction differs (4-6 Chinese chars vs 2-5 English words)

The route transforms that object into `SynopsisOption[]` and returns `{ options }` with three versions (A/B/C): sensory wonder, companionship, and courage.

### Step 2 — Full story + assets (single interleaved Gemini call)

User picks one synopsis.

→ `POST /api/storybook/{id}/story` → `generateStoryWithAssets()`

- **Model:** `IMAGE_MODEL` (gemini-3.1-flash-image-preview)
- **Modalities:** `responseModalities: ['TEXT', 'IMAGE']` — interleaved
- **Input parts:**
  - Text prompt (story parameters, output format instructions)
  - Optional protagonist reference image with label text: `"Reference image below is the protagonist \"Name\"..."`
- **Prompt structure:** Instructs Gemini to output in order:
  1. `[STORY BODY]` — the story text with `[Scene 1]`, `[Scene 2]` markers
  2. `<!--NPCS:[...]-->` and `<!--CHOICES:[...]-->` markers
  3. Optional `<!--SUPPORTING:{...}-->` if supporting character was invented
  4. `[CHARACTER - Name]` + portrait image for each listed NPC, and also for the invented supporting character when `needsSupportingCharacter` is true
  5. `[COVER]` + cover image
- **Response parsing:** Walks `response.candidates[0].content.parts` sequentially:
  - Text parts: accumulated into `allText`, also tracked per-image as `pendingTextSinceLastImage`
  - Image parts: compressed to 768px JPEG, mapped to NPC or cover based on preceding text labels
- **Text extraction:** Regex for `<!--CHOICES:(...)-->`, `<!--NPCS:(...)-->`, `<!--SUPPORTING:(...)-->`, then `stripInterleavedStorySections()` removes section headers to get clean story text

This single call produces:
- The full story text (with `[Scene 1]`, `[Scene 2]` markers)
- A cover image
- NPC character portraits (if new characters appear)
- An invented supporting character payload when the storybook is considered to have no named non-NPC companion
- End-of-episode choices
- NPC metadata

**NPC auto-discovery and persistence:**

After the interleaved call, the endpoint:
1. For invented supporting characters (`<!--SUPPORTING:{...}-->`): adds a supporting entry to the storybook, and creates a Character record only if a portrait image was successfully mapped
2. For each NPC in `<!--NPCS:[...]-->`: adds a storybook entry with `isNpc: true`, and creates a Character record only if a portrait image was successfully mapped
3. Updates the storybook's characters array, then creates the chapter record and returns `{ story, synopsisVersion, discoveredNpcs }`

## Phase 3: Video Pipeline

### Step 3 — Director script + scene images (single interleaved Gemini call)

User picks scene count (3 / 5 / 7). The frontend sends this as equal `minLength`/`maxLength` values.

→ `POST /api/story/director-script` → `generateInterleavedDirectorScript()`

- **Model:** `IMAGE_MODEL`
- **Modalities:** `responseModalities: ['TEXT', 'IMAGE']` — interleaved
- **Input parts:**
  - Text prompt with full story content, character pool, character profiles, style description
  - Character reference images (all characters with portraits) — each preceded by `"Reference image for {name}:"` label
- **Prompt structure:** For each of N scenes, Gemini outputs:
  1. `<!--SCENE_META:{"index":1,"sceneDescription":"...","cameraDesign":"...","animationAction":"...","voiceOver":"...","dialogue":[...],"charactersUsed":[...],"estimatedDuration":10,"openingFramePrompt":"...","midActionFramePrompt":"...","endingFramePrompt":"..."}-->`
  2. Immediately generates a 16:9 illustration based on `openingFramePrompt`
- **Response parsing:** Walks parts sequentially:
  - Text parts: regex `<!--SCENE_META:(.*?)-->` extracts JSON, tracks `lastParsedSceneIndex`
  - Image parts: compressed to 768px JPEG, mapped to `lastParsedSceneIndex` in `sceneImages` Map
- **Post-processing:** Character name normalization — `canonicalByKey` map resolves aliases, `withCharacters()` appends character labels to frame prompts if not already present
- **Pre-generated images** saved to `videos/pre-{scriptId}/scene-{idx}.jpg`
- **Fallback:** If interleaved fails, falls through to `generateStorybookDirectorScript()` (`TEXT_MODEL`, text only, no images)

### Step 4 — Async video production

→ `POST /api/video/start` — returns immediately, runs pipeline in background

| Stage | What happens | Gemini? |
|-------|-------------|---------|
| **1. Images** | Use pre-generated images from Step 3. Only call `generateSceneIllustration()` for scenes missing an image. That image helper uses Banana first and falls back to Gemini `generateStoryImage()`. | Only for missing |
| **2. Audio** | Per-line TTS via Gemini for narration + dialogue, concatenated per scene via FFmpeg. Fallback: single TTS call for entire scene. | Yes (TTS) |
| **3. Clips** | FFmpeg combines each scene's image + audio into an MP4 clip. | No |
| **4. Concat** | FFmpeg merges all clips into `raw.mp4`. | No |
| **5. Subtitles** | Build SRT from line-level timings, burn into video → `final.mp4`. | No |

The play page polls `GET /api/story/{storyId}` every 3 seconds and reads the embedded `videoProject` payload until `status` becomes `complete` or `failed`.

## All Gemini Calls

| # | Function | Model | Modalities | When |
|---|----------|-------|------------|------|
| 1 | `generateCharacterWithStyleRef` × 5 | IMAGE_MODEL | image | Storybook setup (parallel) |
| 2 | `generateCompanionSuggestions` | TEXT_MODEL | text | Storybook setup |
| 3 | `generateCompanionCharacterCartoon` | Banana primary, Gemini IMAGE_MODEL fallback | image | Storybook creation (per companion) |
| 4 | `generateSynopsisVersions` | TEXT_MODEL | text | Chapter creation |
| 5 | `generateStoryWithAssets` | IMAGE_MODEL | text+image | Chapter creation |
| 6 | `generateInterleavedDirectorScript` | IMAGE_MODEL | text+image | Video pipeline |
| 7 | `generateStorybookDirectorScript` | TEXT_MODEL | text | Video pipeline (fallback for #6) |
| 8 | `generateSceneIllustration` | Banana primary, Gemini IMAGE_MODEL fallback | image | Video Stage 1 for scenes missing a pre-generated image |
| 9 | TTS calls | Gemini TTS | audio | Video Stage 2 |
| 10 | `assignCharacterVoice` | TEXT_MODEL | text | Character voice setup |
