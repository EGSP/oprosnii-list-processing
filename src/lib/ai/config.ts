/**
 * Конфигурация AI сервисов
 *
 * Явное определение используемых моделей и параметров для YandexOCR и YandexGPT.
 * Все настройки моделей находятся здесь для удобного изменения.
 */

import type { AIConfig, YandexOCRConfig, YandexGPTConfig } from './types.js';

/**
 * Конфигурация YandexOCR
 *
 * Модель и параметры для OCR сервиса Yandex.
 * Endpoint по умолчанию: https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText
 */
function getYandexOCRConfig(): YandexOCRConfig {
	const apiKey = process.env.YANDEX_OCR_API_KEY;
	if (!apiKey) {
		throw new Error(
			'YANDEX_OCR_API_KEY не установлен. Установите переменную окружения YANDEX_OCR_API_KEY.'
		);
	}

	return {
		apiKey,
		folderId: process.env.YANDEX_OCR_FOLDER_ID,
		model: process.env.YANDEX_OCR_MODEL || 'latest', // По умолчанию используем latest версию
		endpoint:
			process.env.YANDEX_OCR_ENDPOINT || 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText'
	};
}

/**
 * Конфигурация YandexGPT
 *
 * Модель и параметры для LLM сервиса YandexGPT.
 * Endpoint по умолчанию: https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 */
function getYandexGPTConfig(): YandexGPTConfig {
	const apiKey = process.env.YANDEX_GPT_API_KEY;
	if (!apiKey) {
		throw new Error(
			'YANDEX_GPT_API_KEY не установлен. Установите переменную окружения YANDEX_GPT_API_KEY.'
		);
	}

	const model = process.env.YANDEX_GPT_MODEL || 'yandexgpt';
	if (!model) {
		throw new Error('YANDEX_GPT_MODEL должен быть указан');
	}

	return {
		apiKey,
		folderId: process.env.YANDEX_GPT_FOLDER_ID,
		model, // Явное определение модели: yandexgpt, yandexgpt-lite и т.д.
		endpoint:
			process.env.YANDEX_GPT_ENDPOINT ||
			'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
	};
}

/**
 * Полная конфигурация AI сервисов
 *
 * Все настройки моделей и API находятся здесь.
 * При необходимости изменения моделей - редактируйте этот объект.
 */
export const aiConfig: AIConfig = {
	yandexOCR: getYandexOCRConfig(),
	yandexGPT: getYandexGPTConfig()
} as const;

/**
 * Проверка наличия всех необходимых переменных окружения
 */
export function validateAIConfig(): void {
	try {
		getYandexOCRConfig();
		getYandexGPTConfig();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Ошибка конфигурации AI: ${error.message}`);
		}
		throw error;
	}
}
