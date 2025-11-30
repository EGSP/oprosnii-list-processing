/**
 * Конфигурация AI сервисов
 *
 * Явное определение используемых моделей и параметров для YandexOCR и YandexGPT.
 * Все настройки моделей находятся здесь для удобного изменения.
 *
 * Использует $env/dynamic/private для доступа к приватным переменным окружения в SvelteKit.
 * Эти переменные доступны только на сервере и не попадают в клиентский код.
 */

import { env } from '$env/dynamic/private';
import type { AIConfig, YandexOCRConfig, YandexGPTConfig } from './types.js';

/**
 * Конфигурация YandexOCR
 *
 * Модель и параметры для OCR сервиса Yandex.
 * Endpoint по умолчанию: https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText
 */
function getYandexOCRConfig(): YandexOCRConfig {
	const apiKey = env.YANDEX_OCR_API_KEY;
	if (!apiKey) {
		throw new Error(
			'YANDEX_OCR_API_KEY не установлен. Установите переменную окружения YANDEX_OCR_API_KEY.'
		);
	}

	return {
		apiKey,
		folderId: env.YANDEX_OCR_FOLDER_ID,
		model: env.YANDEX_OCR_MODEL || 'page', // По умолчанию используем page версию
		endpoint:
			env.YANDEX_OCR_ENDPOINT || 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',
		asyncEndpoint: env.YANDEX_OCR_ASYNC_ENDPOINT, // для многостраничных PDF
		operationEndpoint:
			env.YANDEX_OCR_OPERATION_ENDPOINT ||
			'https://operation.api.cloud.yandex.net/operations', // для проверки статуса операций
		getRecognitionEndpoint:
			env.YANDEX_OCR_GET_RECOGNITION_ENDPOINT ||
			'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition' // для получения результатов распознавания
	};
}

/**
 * Конфигурация YandexGPT
 *
 * Модель и параметры для LLM сервиса YandexGPT.
 * Endpoint по умолчанию: https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 */
function getYandexGPTConfig(): YandexGPTConfig {
	const apiKey = env.YANDEX_GPT_API_KEY;
	if (!apiKey) {
		throw new Error(
			'YANDEX_GPT_API_KEY не установлен. Установите переменную окружения YANDEX_GPT_API_KEY.'
		);
	}

	const model = env.YANDEX_GPT_MODEL || 'yandexgpt';
	if (!model) {
		throw new Error('YANDEX_GPT_MODEL должен быть указан');
	}

	return {
		apiKey,
		folderId: env.YANDEX_GPT_FOLDER_ID,
		model, // Явное определение модели: yandexgpt, yandexgpt-lite и т.д.
		endpoint:
			env.YANDEX_GPT_ENDPOINT ||
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
