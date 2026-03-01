# Storybook AI - Context & Instructions

This project is a **Storybook AI** application built with **Next.js 15**, **React 19**, and **Gemini AI**. It allows users to create cartoon characters from photos and generate personalized, illustrated, and narrated bedtime stories.

## 🚀 Project Overview

- **Core Functionality:** Photo-to-cartoon transformation, AI-powered multi-character story generation, and scene-by-scene illustrations.
- **Primary Tech Stack:**
  - **Framework:** Next.js (App Router)
  - **AI:** `@google/genai` (Gemini 3.1 Flash Image, Gemini 3 Flash, Gemini 2.5 Flash Preview TTS).
  - **Database:** Prisma with SQLite.
  - **Image Processing:** `sharp` for compression and resizing.
- **Architecture:** 
  - **Decoupled Workflow:** Character creation is independent of story generation. Characters are stored in a library and can be reused.
  - **Multi-Character Support:** Stories can feature up to 3 characters simultaneously.
  - **AI Logic:** Centralized in `lib/gemini.ts` for consistent prompting and error handling.

## 🛠️ Commands & Scripts

- **Development:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Prisma:**
  - Generate Client: `npx prisma generate`
  - Migrate DB: `npx prisma migrate dev`
  - Studio: `npx prisma studio`

## 🧠 Development Conventions

- **AI Prompting:** 
  - Use `lib/gemini.ts` for all AI-related logic. 
  - Always include character descriptions/settings in story prompts to maintain consistency.
  - Predict costs using `estimatePrice` before significant generations.
- **Database:**
  - Use `lib/db.ts` for all database interactions.
  - Ensure characters are connected to stories using Prisma's `connect` in many-to-many relationships.
- **Styling:** 
  - Follow the existing **Tailwind CSS** patterns. 
  - Use the custom "rainbow-text" and gradient button styles (`btn-primary`, `btn-secondary`).
- **Error Handling:** 
  - Use `getGeminiErrorResponse` for standard AI error mapping (rate limits, timeouts, safety filters).
- **Images:** 
  - Compress generated images using `compressImage` to save storage and improve performance.

## 📁 Key File Map

- `lib/gemini.ts`: AI model configurations, prompting, and cost estimation.
- `lib/db.ts`: Character and Story CRUD operations.
- `prisma/schema.prisma`: Database schema definition.
- `app/api/`: Backend endpoints for AI and DB operations.
- `app/story/create/`: Multi-character story creation flow.
- `app/character/`: Character creation and "setting" management.
- `types/index.ts`: Centralized TypeScript interfaces.

## ⚠️ Security & Environment

- Ensure `GEMINI_API_KEY` is set in `.env.local` (`GEMINI_TTS_VOICE` is optional).
- Never commit the `prisma/dev.db` or sensitive environment variables.
