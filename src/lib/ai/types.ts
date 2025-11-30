/**
 * Типы для модуля AI
 */

export interface YandexOCRConfig {
	apiKey: string;
	folderId?: string;
	model?: string;
	endpoint?: string;
	asyncEndpoint?: string; // для многостраничных PDF
	operationEndpoint?: string; // для проверки статуса операций
	getRecognitionEndpoint?: string; // для получения результатов распознавания
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
