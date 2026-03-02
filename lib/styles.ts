/**
 * Art style configurations for character portrait generation.
 *
 * Each style is derived from the reference images in image-file/style{N}/:
 *
 * Style 1 — Studio Ghibli / Little Prince:
 *   Hand-drawn anime illustration, vibrant saturated colors, warm sunlit lighting,
 *   simple expressive faces with large eyes, lush natural setting.
 *   Reference: image-file/style1/
 *
 * Style 2 — Soft Crayon / Dreamy Watercolor:
 *   Gentle crayon + watercolor blend, muted pastels, round chubby character,
 *   sketchy outlines, dreamy atmospheric background.
 *   Reference: image-file/style2/
 *
 * Style 3 — 3D Cute Plush / Chibi Render:
 *   Hyper-detailed 3D render, soft plush/fur texture, chibi proportions,
 *   smooth pastel palette, very cute Chinese kawaii style.
 *   Reference: image-file/style3/
 *
 * Style 4 — Clay / Stop-Motion:
 *   Clay animation / claymation look, handcrafted sculpted texture,
 *   slightly rough clay surface, warm earthy tones, like Shaun the Sheep.
 *   Reference: image-file/style4/
 *
 * Style 5 — European Colored-Pencil Storybook:
 *   Traditional colored pencil + light watercolor wash, detailed texture,
 *   warm nostalgic children's book feel, classic illustrated style.
 *   Reference: image-file/style5/
 */

export interface StyleConfig {
  id: string
  label: string
  emoji: string
  description: string
  /** Full prompt injected when generating a character portrait in this style */
  characterPrompt: string
  /** Negative prompt — what to suppress */
  negativePrompt: string
  /** Style reference image served from /public (shown in UI + passed to Banana/Gemini) */
  referenceImageUrl: string
  /** Example character portrait generated for this style, served from /public */
  exampleImageUrl: string
}

export const STYLES: StyleConfig[] = [
  {
    id: 'ghibli',
    label: '吉卜力',
    emoji: '🌿',
    description: '宫崎骏手绘动画风格，温暖自然色调',
    characterPrompt:
      'Studio Ghibli anime style character portrait, Little Prince illustration style, hand-drawn anime, ' +
      'warm vibrant saturated colors, simple large expressive eyes, round friendly face, ' +
      'clean neutral light background, children\'s book character, gentle sunlit warm atmosphere, ' +
      'full upper body portrait, centered composition',
    negativePrompt:
      'realistic, photographic, 3D render, CGI, scary, dark, watermark, text, adult, mature',
    referenceImageUrl: '/style-refs/style1.jpg',
    exampleImageUrl: '/style-examples/ghibli.jpg',
  },
  {
    id: 'watercolor',
    label: '水彩童话',
    emoji: '🌙',
    description: '蜡笔水彩混合，柔和马卡龙色调，梦幻感',
    characterPrompt:
      'Soft crayon and watercolor illustration, children\'s picture book style, ' +
      'muted pastel palette, gentle sketchy outlines, round chubby adorable face, ' +
      'dreamy soft atmospheric lighting, pale backgrounds, hand-drawn texture, ' +
      'warm and cozy storybook feel, upper body portrait, centered',
    negativePrompt:
      'realistic, photographic, 3D render, sharp lines, neon colors, watermark, text, adult',
    referenceImageUrl: '/style-refs/style2.jpg',
    exampleImageUrl: '/style-examples/watercolor.jpg',
  },
  {
    id: 'plush3d',
    label: '3D 可爱',
    emoji: '🧸',
    description: '超精细3D渲染，毛绒质感，卡哇伊风格',
    characterPrompt:
      '3D rendered cute chibi character portrait, soft plush toy texture, ' +
      'adorable round face with big shiny eyes, smooth pastel color palette, ' +
      'Pixar-inspired hyper-cute Chinese kawaii style, high detail fur or skin texture, ' +
      'soft studio lighting, clean simple background, upper body centered portrait',
    negativePrompt:
      'flat illustration, watercolor, sketchy, realistic photo, scary, watermark, text, adult',
    referenceImageUrl: '/style-refs/style3.jpg',
    exampleImageUrl: '/style-examples/plush3d.jpg',
  },
  {
    id: 'claymation',
    label: '黏土动画',
    emoji: '🫧',
    description: '黏土定格动画风格，手工质感，圆润可爱',
    characterPrompt:
      'Clay animation character portrait, stop-motion claymation style, ' +
      'handcrafted sculpted look with visible clay texture, slightly rough surface detail, ' +
      'warm earthy natural tones, round friendly proportions, ' +
      'like Shaun the Sheep or Aardman animation, soft studio lighting, ' +
      'clean simple background, centered upper body portrait',
    negativePrompt:
      'realistic photo, 2D flat illustration, watercolor, anime, scary, watermark, text, adult',
    referenceImageUrl: '/style-refs/style4.jpg',
    exampleImageUrl: '/style-examples/claymation.jpg',
  },
  {
    id: 'pencil',
    label: '彩铅绘本',
    emoji: '✏️',
    description: '欧式彩铅插画，经典童书手绘风格',
    characterPrompt:
      'Colored pencil illustration, European children\'s storybook style, ' +
      'traditional pencil sketch with soft watercolor wash, visible pencil texture and hatching, ' +
      'warm nostalgic tones, classic book illustration feel, detailed fine lines, ' +
      'gentle warm lighting, light paper-texture background, upper body portrait, centered',
    negativePrompt:
      'photographic, 3D render, digital, flat, neon, anime, watermark, text, adult, scary',
    referenceImageUrl: '/style-refs/style5.jpg',
    exampleImageUrl: '/style-examples/pencil.jpg',
  },
]

export function getStyleById(id: string): StyleConfig | undefined {
  return STYLES.find((s) => s.id === id)
}
