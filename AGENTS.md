# Storybook AI - Project Guide for AI Agents

## Project Overview

Storybook AI is a Next.js web application that transforms user photos into magical cartoon characters and creates personalized bedtime stories powered by Google's AI models. The application was built for a Google Hackathon and showcases the use of cutting-edge AI models including Gemini 3.1 Flash Image (for character and illustration generation) and Gemini 3 Flash (for story text generation).

**Key Features:**
- Photo upload and transformation into cartoon characters
- AI-powered story generation with multiple options
- Scene-by-scene illustrated stories with custom images
- Voice narration using ElevenLabs text-to-speech
- Interactive story player with audio controls

## Technology Stack

- **Framework**: Next.js 15.1.0 with React 19 and TypeScript 5
- **Styling**: Tailwind CSS 3.4.17 with custom color theme
- **AI Models**:
  - Google Gemini 3.1 Flash Image (`gemini-3.1-flash-image`) - Character & illustration generation
  - Google Gemini 3 Flash (`gemini-3-flash`) - Story text generation
  - ElevenLabs API - Voice narration
- **Backend**: Next.js API routes with local/session storage
- **Deployment**: Optimized for Vercel

## Project Structure

```
storybook-ai/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── character/
│   │   │   └── route.ts          # POST - Generate character from photo
│   │   └── story/
│   │       ├── generate/
│   │       │   └── route.ts      # POST - Generate full story with images
│   │       └── options/
│   │           └── route.ts      # POST - Generate story options
│   ├── character/                # Character creation flow
│   │   ├── page.tsx              # Photo upload page
│   │   └── name/
│   │       └── page.tsx          # Character naming page
│   ├── story/                    # Story generation flow
│   │   ├── create/
│   │   │   └── page.tsx          # Story keywords input
│   │   ├── options/
│   │   │   └── page.tsx          # Story selection page
│   │   └── play/
│   │       └── page.tsx          # Interactive story player
│   ├── globals.css               # Global styles with Tailwind
│   ├── layout.tsx                # Root layout with metadata
│   └── page.tsx                  # Landing page
├── lib/                          # Utilities
│   └── gemini.ts                 # Gemini API wrappers
├── types/                        # TypeScript types
│   └── index.ts                  # Core interfaces (Character, Story, etc.)
├── .env.local.example            # Environment variable template
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
└── tsconfig.json                 # TypeScript configuration
```

## Build and Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run ESLint
npm run lint
```

The development server runs on [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.local.example` to `.env.local` and configure the following:

```bash
# Google Gemini API Key
# Get from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# ElevenLabs API Key
# Get from: https://elevenlabs.io/app/settings/api-keys
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

## Code Style Guidelines

### TypeScript
- Strict mode enabled in `tsconfig.json`
- Path alias `@/*` maps to root directory
- Target: ES2017

### Component Structure
- All pages use `'use client'` directive for client-side interactivity
- Components use functional component syntax with TypeScript types
- State management uses React hooks (`useState`, `useEffect`, `useRef`)

### Naming Conventions
- Components: PascalCase (e.g., `CharacterPage`, `StoryOptionsPage`)
- Files: Lowercase with hyphens for directories, descriptive names
- Types/Interfaces: PascalCase in `types/index.ts`

### Tailwind CSS Classes
- Custom components defined in `globals.css` using `@layer components`:
  - `.btn-primary` - Primary action button (blue)
  - `.btn-secondary` - Secondary button (white with border)
  - `.card` - White card with shadow and rounded corners
  - `.input` - Form input with focus ring
- Custom colors defined in `tailwind.config.ts` under `theme.extend.colors.primary`

## Data Flow

### Character Creation Flow
1. User uploads photo at `/character`
2. `POST /api/character` calls Gemini 3.1 Flash Image to generate cartoon
3. Original and generated images are returned as data URLs from the API
4. Character data is stored client-side in `localStorage` for session continuity
5. User names character at `/character/name`

### Story Generation Flow
1. User enters keywords at `/story/create`
2. `POST /api/story/options` calls Gemini 3 Flash to generate 3 story options
3. Options displayed at `/story/options` for user selection
4. `POST /api/story/generate` generates:
   - Full story text using Gemini 3 Flash
   - Scene images using Gemini 3.1 Flash Image
   - Audio narration using ElevenLabs API
5. Story assets are returned to the client as data URLs
6. Story data is stored client-side for playback
7. Interactive player at `/story/play` with audio controls

## State Management

The application uses `localStorage` for client-side state persistence during the creation flow:
- `currentCharacter` - Stores the current character object
- `storyOptions` - Stores generated story options
- `storyKeywords` - Stores user's story keywords
- `ageGroup` - Stores selected age group
- `currentStory` - Stores the generated story

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/character` | POST | Generate cartoon character from photo |
| `/api/story/options` | POST | Generate 3 story options based on keywords |
| `/api/story/generate` | POST | Generate full story with images and audio |

Note: There is a reference to `PATCH /api/character/${id}` in `app/character/name/page.tsx` but the route handler implementation is incomplete.

## Security Considerations

- API keys are stored in environment variables
- Server-side API calls (Gemini, ElevenLabs) happen in API routes only
- No authentication implemented - generated content is session-local in the current flow

## Known Issues / TODOs

1. **Missing PATCH endpoint**: The character name update references `PATCH /api/character/${id}` but the route handler only implements POST
2. **API error handling**: Basic error handling in place, but could be more granular
3. **Rate limiting**: No client-side rate limiting for API calls
4. **Image validation**: No file size or type validation on client-side upload

## Free Tier Limits

| Service | Free Limit |
|---------|------------|
| Gemini 3.1 Flash Image | 1500 requests/day |
| Gemini 3 Flash | 1500 requests/day |
| ElevenLabs | 10k characters/month |
| Vercel | Hobby Plan |

## Development Tips

1. When adding new AI features, add wrapper functions in `lib/gemini.ts`
2. New page routes should follow the existing flow pattern with `localStorage` for state
3. API routes should validate request bodies and return appropriate HTTP status codes
4. Images are stored as base64/data URLs - be mindful of payload size limits
5. The story player uses a dark theme (`bg-gray-900`) while other pages use light theme
