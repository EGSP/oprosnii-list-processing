/**
 * Типы для модуля AI
 */

export interface YandexOCRConfig {
	apiKey: string;
	folderId?: string;
	model?: string;
	endpoint?: string;
}

export interface YandexGPTConfig {
	apiKey: string;
	folderId?: string;
	model: string;
	endpoint?: string;
}

export interface AIConfig {
	yandexOCR: YandexOCRConfig;
	yandexGPT: YandexGPTConfig;
}

export interface LLMOptions {
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	topK?: number;
}
