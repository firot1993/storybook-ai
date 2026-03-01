export interface Character {
  id: string;
  name: string;
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
  characterId: string;
  title: string;
  content: string;
  images: string[];
  audioUrl: string;
  createdAt: Date;
}

export interface GenerateCharacterRequest {
  imageBase64: string;
}

export interface GenerateCharacterResponse {
  character: Character;
}

export interface GenerateStoryOptionsRequest {
  characterName: string;
  keywords: string;
  ageGroup: '2-4' | '4-6' | '6-8';
}

export interface GenerateStoryOptionsResponse {
  options: StoryOption[];
}

export interface GenerateStoryRequest {
  characterId?: string;
  characterName: string;
  characterImage?: string;
  optionIndex: number;
  optionTitle?: string;
  optionDescription?: string;
  keywords?: string;
  ageGroup?: '2-4' | '4-6' | '6-8';
}

export interface GenerateStoryResponse {
  story: Story;
}
