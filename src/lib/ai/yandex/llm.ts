/**
 * Модуль Yandex LLM
 *
 * Функции для работы с YandexGPT API:
 * - Отправка запросов в YandexGPT через REST API
 * - Structured output через Zod схемы
 * - Настройка параметров модели (temperature, maxTokens и т.д.)
 */

import { z } from 'zod';
import { aiConfig } from '../config.js';
import type { LLMOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

export class YandexLLMError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexLLMError';
	}
}

/**
 * Вызывает YandexGPT API и возвращает текстовый ответ
 *
 * @param prompt - Промпт для LLM
 * @param systemPrompt - Системный промпт (опционально)
 * @param options - Параметры модели (temperature, maxTokens и т.д.)
 * @returns Текстовый ответ от LLM
 */
export async function callYandexGPT(
	prompt: string,
	systemPrompt?: string,
	options?: LLMOptions
): Promise<string> {
	const config = aiConfig.yandexGPT;

	logger.debug('Вызов YandexGPT', {
		promptLength: prompt.length,
		hasSystemPrompt: !!systemPrompt
	});

	// Формируем сообщения для API
	const messages: Array<{ role: string; text: string }> = [];

	if (systemPrompt) {
		messages.push({
			role: 'system',
			text: systemPrompt
		});
	}

	messages.push({
		role: 'user',
		text: prompt
	});

	// Формируем тело запроса
	const completionOptions: {
		stream: boolean;
		temperature: number;
		maxTokens: string | number;
		topP?: number;
		topK?: number;
	} = {
		stream: false,
		temperature: options?.temperature ?? 0.6,
		maxTokens: options?.maxTokens ?? '2000'
	};

	// Добавляем дополнительные параметры, если указаны
	if (options?.topP !== undefined) {
		completionOptions.topP = options.topP;
	}
	if (options?.topK !== undefined) {
		completionOptions.topK = options.topK;
	}

	const requestBody: Record<string, unknown> = {
		modelUri: config.folderId ? `gpt://${config.folderId}/${config.model}` : config.model,
		completionOptions,
		messages
	};

	try {
		logger.debug('Отправка запроса в YandexGPT', {
			endpoint: config.endpoint,
			model: config.model
		});

		const response = await fetch(config.endpoint!, {
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexGPT API вернул ошибку', {
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new YandexLLMError(
				`YandexGPT API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		// Извлекаем текст из ответа
		// Структура ответа: { result: { alternatives: [{ message: { text: string } }] } }
		let text: string | undefined;
		if (result.result?.alternatives?.[0]?.message?.text) {
			text = result.result.alternatives[0].message.text;
		} else if (result.alternatives?.[0]?.message?.text) {
			text = result.alternatives[0].message.text;
		}

		if (!text) {
			logger.error('Не удалось извлечь текст из ответа YandexGPT', {
				responseStructure: JSON.stringify(result).substring(0, 200)
			});
			throw new YandexLLMError('Не удалось извлечь текст из ответа YandexGPT');
		}

		logger.info('YandexGPT успешно вернул ответ', {
			textLength: text.length
		});

		return text;
	} catch (error) {
		logger.error('Ошибка при вызове YandexGPT', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});

		if (error instanceof YandexLLMError) {
			throw error;
		}
		throw new YandexLLMError('Ошибка при вызове YandexGPT API', error as Error);
	}
}

/**
 * Вызывает YandexGPT с structured output через Zod схему
 *
 * Парсит JSON из ответа LLM и валидирует его через Zod схему.
 * Если парсинг или валидация не удались, делает повторную попытку с более строгим промптом.
 *
 * @param prompt - Промпт для LLM (должен содержать инструкцию возвращать JSON)
 * @param schema - Zod схема для валидации ответа
 * @param systemPrompt - Системный промпт (опционально)
 * @param options - Параметры модели
 * @param maxRetries - Максимальное количество попыток (по умолчанию 2)
 * @returns Валидированный объект, соответствующий схеме
 */
export async function callYandexGPTStructured<T extends z.ZodTypeAny>(
	prompt: string,
	schema: T,
	systemPrompt?: string,
	options?: LLMOptions,
	maxRetries: number = 2
): Promise<z.infer<T>> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			logger.debug('Попытка получения structured output', {
				attempt: attempt + 1,
				maxRetries: maxRetries + 1
			});

			// Добавляем инструкцию о формате JSON в промпт (если это не первая попытка)
			let enhancedPrompt = prompt;
			if (attempt > 0) {
				enhancedPrompt = `${prompt}\n\nВАЖНО: Верни ТОЛЬКО валидный JSON без дополнительного текста, комментариев или markdown разметки.`;
				logger.debug('Повторная попытка с усиленным промптом', {
					attempt: attempt + 1
				});
			}

			const response = await callYandexGPT(enhancedPrompt, systemPrompt, options);

			// Пытаемся извлечь JSON из ответа
			let jsonText = response.trim();

			// Удаляем markdown код блоки, если они есть
			if (jsonText.startsWith('```')) {
				const lines = jsonText.split('\n');
				// Удаляем первую строку (```json или ```)
				lines.shift();
				// Удаляем последнюю строку (```)
				if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
					lines.pop();
				}
				jsonText = lines.join('\n');
			}

			// Парсим JSON
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonText);
			} catch (parseError) {
				logger.warn('Ошибка парсинга JSON из ответа LLM', {
					attempt: attempt + 1,
					error: (parseError as Error).message,
					jsonPreview: jsonText.substring(0, 200)
				});
				throw new YandexLLMError(
					`Не удалось распарсить JSON из ответа LLM: ${(parseError as Error).message}. Ответ: ${jsonText.substring(0, 200)}`
				);
			}

			// Валидируем через Zod схему
			const validated = schema.parse(parsed);

			logger.info('Structured output успешно получен и валидирован', {
				attempt: attempt + 1
			});

			return validated;
		} catch (error) {
			lastError = error as Error;

			logger.warn('Ошибка при получении structured output', {
				attempt: attempt + 1,
				maxRetries: maxRetries + 1,
				error: error instanceof Error ? error.message : String(error)
			});

			// Если это последняя попытка, выбрасываем ошибку
			if (attempt === maxRetries) {
				break;
			}

			// Иначе продолжаем попытки
			continue;
		}
	}

	// Если все попытки не удались, выбрасываем последнюю ошибку
	logger.error('Не удалось получить валидный structured output после всех попыток', {
		maxRetries: maxRetries + 1,
		lastError: lastError?.message
	});
	throw new YandexLLMError(
		`Не удалось получить валидный structured output после ${maxRetries + 1} попыток`,
		lastError || undefined
	);
}

