export interface PromptTemplate {
  id: string;
  name: string;
  intentType: string;
  layer?: string;
  systemPrompt: string;
  userPromptTemplate?: string | null;
  modelPreference?: string | null;
  isActive?: boolean;
}

export interface PromptPayload {
  name: string;
  intentType: string;
  layer: string;
  systemPrompt: string;
  userPromptTemplate: string;
  modelPreference: string | null;
}

export interface PromptTab {
  key: string;
  label: string;
}
