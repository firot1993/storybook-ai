# Storybook AI - Google Hackathon Project

Transform any photo into a magical cartoon character and create personalized bedtime stories powered by Google's latest AI models.

## 🚀 Tech Stack

- **Framework**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS
- **AI Models**:
  - **Gemini 3.1 Flash Image** (Nano Banana 2) - Character & illustration generation
  - **Gemini 3 Flash** - Story text generation
  - **ElevenLabs** - Voice narration
- **Backend**: Next.js API routes (stateless/local-session flow)
- **Deployment**: Vercel

## 🎯 Demo Pitch

> "We built this using Google's latest AI models released just 2 days ago — Gemini 3.1 Flash Image (Nano Banana 2). This might be one of the first projects at this hackathon using this cutting-edge model!"

## 📁 Project Structure

```
storybook-ai/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Landing page
│   ├── character/         # Character creation flow
│   ├── story/             # Story generation flow
│   └── api/               # API Routes
├── lib/                   # Utilities
│   └── gemini.ts          # Gemini API wrapper
├── components/            # Reusable components
└── types/                 # TypeScript types
```

## 🛠️ Setup

### 1. Clone & Install

```bash
cd storybook-ai
npm install
```

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your API keys:

```bash
cp .env.local.example .env.local
```

Required keys:
- `GEMINI_API_KEY` - Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
- `ELEVENLABS_API_KEY` - Get from [ElevenLabs](https://elevenlabs.io/)

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🎨 Features

1. **Photo to Cartoon** - Upload any photo, get a storybook character
2. **AI Story Generation** - Input keywords, get 3 story options
3. **Illustrated Stories** - Each story has custom AI-generated images
4. **Voice Narration** - Professional text-to-speech narration
5. **Interactive Player** - Browse scenes while listening

## 💰 Free Tier Limits

| Service | Free Limit |
|---------|------------|
| Gemini 3.1 Flash Image | 1500 requests/day |
| Gemini 3 Flash | 1500 requests/day |
| ElevenLabs | 10k characters/month |
| Vercel | Hobby Plan (unlimited) |

**Total Cost: $0** 🎉

## 🏆 Hackathon Tips

1. **Start Simple** - Get the character generation working first
2. **Cache Results** - Save generated images to avoid regenerating
3. **Error Handling** - Add fallbacks for API failures
4. **Demo Flow** - Practice the complete user journey
5. **Pitch Practice** - Emphasize the "2-day-old model" angle!

## 📝 License

MIT - Made with ❤️ for Google Hackathon
