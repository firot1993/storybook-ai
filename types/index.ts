export interface Character {
  id: string;
  name: string;
  description: string;
  originalImage: string;
  cartoonImage: string;
  createdAt: Date;
}

export interface StoryOption {
  title: string;
  description: string;
}

export interface Story {
  id: string;
  characterIds: string[];
  title: string;
  content: string;
  images: string[];
  audioUrl: string;
  sceneAudioUrls?: string[];
  createdAt: Date;
}

export interface GenerateCharacterRequest {
  imageBase64: string;
}

export interface GenerateCharacterResponse {
  character: Character;
}

export interface GenerateStoryOptionsRequest {
  characterNames: string[];
  keywords: string;
  ageGroup: '2-4' | '4-6' | '6-8';
}

export interface GenerateStoryOptionsResponse {
  options: StoryOption[];
}

export interface GenerateStoryRequest {
  characterIds?: string[];
  characterNames: string[];
  characterImages?: string[];
  optionIndex: number;
  optionTitle?: string;
  optionDescription?: string;
  keywords?: string;
  ageGroup?: '2-4' | '4-6' | '6-8';
}

export interface GenerateStoryResponse {
  story: Story;
}

export interface CharacterWithStoryCount {
  id: string;
  name: string;
  cartoonImage: string;
  createdAt: Date;
  _count: { stories: number };
}
