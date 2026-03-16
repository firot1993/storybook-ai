# How We Built Storybook AI With Google AI Models and Google Cloud

> I created this piece of content for the purposes of entering this hackathon, the Gemini Live Agent Challenge.

Storybook AI is a storybook-first application for turning a child photo into a reusable character, then using that character to generate story chapters, cover art, scene plans, and a final narrated video. The app is built with Next.js, TypeScript, Prisma, and an AI pipeline centered on Google AI models, with deployment and storage paths designed for Google Cloud.

## The Product Flow

The project is intentionally structured as a sequence of small, testable AI steps rather than one giant prompt:

1. Generate a child-friendly character portrait from a real photo in multiple art styles.
2. Create a storybook and resolve the protagonist plus supporting characters.
3. Generate three synopsis options from a theme or keyword prompt.
4. Expand the selected synopsis into a full story chapter with a cover image and optional NPC portraits.
5. Generate a director-style scene script and scene imagery.
6. Assemble narration, video clips, and subtitles into a finished MP4.

That split matters. It makes the experience easier to debug, keeps prompts narrower, and lets the app reuse assets across future chapters instead of regenerating everything from scratch.

## Where Google AI Models Power the App

### 1. Character creation with Gemini image generation

The first core workflow is character generation. The app takes a user photo plus a style reference image, then sends both into Gemini image generation so the output keeps the child recognizable while shifting the visual style into a storybook look.

In the current codebase, the default image model is `gemini-3.1-flash-image-preview`. That model is used for:

- multi-style protagonist portrait generation
- story cover generation
- NPC portrait generation
- interleaved scene image generation for the video pipeline

This is the part of the app that turns Storybook AI from a generic story generator into a personalized product.

### 2. Synopsis generation with Gemini text models

Once the character and storybook exist, the app uses Gemini text generation to create multiple synopsis options from a small set of user inputs like theme, keywords, age range, and prior chapter context.

In the current build, the default text model is `gemini-3-flash-preview`. We use it because the synopsis step is mostly about speed, structure, and controllable JSON output. The app expects three versions back, which gives the user a meaningful editorial choice before generating the chapter.

### 3. Full chapter generation with interleaved text + image output

After the user picks a synopsis, the app switches back to Gemini image generation in an interleaved mode. A single request can return:

- the story chapter text
- the cover image
- optional NPC portraits
- structured continuation choices

This design removed a lot of glue code. Instead of coordinating separate calls for text, cover art, and side-character art, the system can parse a single multimodal response and map each returned image to the correct role.

### 4. Director-script generation for video

The same multimodal pattern shows up again in the video workflow. After a chapter is created, Storybook AI generates a director-style scene plan that describes the visual beats, camera framing, and voice-over lines for each scene. The scene-image path can also be pre-generated in the same broad pipeline, which reduces later work during video composition.

This is a good example of where Google AI models helped beyond raw text generation. The model is not just writing prose. It is acting as a structured pre-production system for downstream rendering.

### 5. Speech-to-text with Gemini

The app also supports voice input. In the current implementation, audio transcription uses `gemini-2.0-flash`, which lets the user speak a prompt instead of typing it. That is especially useful in a family-facing product where quick voice input can be more natural than filling out forms.

## Where Google Cloud Fits

### 1. Cloud Run as the production runtime

The repo includes a deployment path for Google Cloud Run. That choice fits the project well because Storybook AI is a containerized Next.js server with bursts of CPU-heavy work during media assembly. Cloud Run gives the app a straightforward deployment model while still letting us package FFmpeg and fonts in the runtime image.

The deployment script configures a 4 vCPU / 4 GB service, which matches the app's heavier video-processing stages better than a minimal serverless footprint.

### 2. Cloud Build for container builds

The deployment flow builds and pushes the container image with `gcloud builds submit`, then deploys that image to Cloud Run. This keeps the shipping path simple:

- build the app into a production container
- include FFmpeg and subtitle fonts
- deploy the image to Cloud Run

That setup is practical for a multimodal app because the runtime needs more than plain JavaScript dependencies. It also needs media tooling.

### 3. Secret management for API keys

The Cloud Run deploy path injects the Gemini and ElevenLabs API keys as secrets instead of hardcoding them into the container image. That matters because the project mixes real model calls, storage, and media processing, so the operational path needs to be clean as well as functional.

### 4. Cloud Storage support for generated assets

Generated files such as images, audio, videos, and subtitles are always written locally first so FFmpeg can work with filesystem paths. When `GCS_BUCKET` is configured, the same storage layer can also upload those assets to Google Cloud Storage and return public URLs.

That dual-path design makes development simple and production more durable:

- local file access for FFmpeg
- optional Google Cloud Storage for serving generated media

## The Non-AI Parts That Still Matter

It would be easy to describe this project only as "Gemini generates stories," but the real engineering work is in how the AI pieces are stitched together.

Some of the most important implementation details are:

- Prisma and typed route payloads to keep storybook, character, and chapter state consistent
- structured parsing of multimodal model responses so text and images stay aligned
- FFmpeg clip composition, concatenation, and subtitle burn-in for the final MP4
- asset persistence so characters and generated media can be reused instead of regenerated
- fallbacks for missing scene images and runtime-safe media handling

The lesson from building this project is that multimodal apps work best when the model output is treated as one part of a larger production pipeline, not the entire product.

## Why This Build Approach Worked

Google AI models handled the generative parts that benefit most from flexibility:

- turning user photos into stylized character art
- writing synopsis options
- expanding a synopsis into a chapter and art package
- transcribing audio input
- generating pre-production-style scene plans

Google Cloud handled the operational side:

- packaging the app for deployment
- running the service in Cloud Run
- supporting persistent asset storage through Cloud Storage
- keeping the runtime compatible with FFmpeg-heavy video work

That division of labor made the system easier to reason about. The models generate creative assets and structure. The cloud runtime makes the pipeline repeatable.

## Closing

Storybook AI was built as a practical multimodal application, not just a demo prompt. The interesting part of the project is how the system turns several focused Google AI calls into a reusable product flow: character creation, story generation, scene planning, and video production.

I created this piece of content for the purposes of entering this hackathon, the Gemini Live Agent Challenge.

## Social Post

I built Storybook AI as a multimodal children's storytelling app with Google AI models and Google Cloud. Gemini handles character art, synopsis generation, chapter creation, scene planning, and speech-to-text, while Cloud Run and Cloud Storage support the production pipeline around generated media. I created this piece of content for the purposes of entering this hackathon. #GeminiLiveAgentChallenge
