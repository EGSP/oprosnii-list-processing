/**
 * Модуль LLM для работы с YandexGPT
 *
 * Поддерживает:
 * - Отправку запросов в YandexGPT через REST API
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import { z } from 'zod';
import { aiConfig } from './config.js';
import type { LLMOptions } from './types.js';
import {
	createOrUpdateOperation,
	updateOperationStatus,
	getOperationByApplicationAndType
} from '../storage/operationsRepository.js';
import type { ProcessingOperationType } from '../storage/types.js';

export class LLMError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'LLMError';
	}
}

/**
 * Вызывает YandexGPT API и возвращает текстовый ответ
 *
 * @param prompt - Промпт для LLM
 * @param systemPrompt - Системный промпт (опционально)
 * @param options - Параметры модели (temperature, maxTokens и т.д.)
 * @param operationConfig - Конфигурация операции (опционально)
 * @returns Текстовый ответ от LLM
 */
export async function callYandexGPT(
	prompt: string,
	systemPrompt?: string,
	options?: LLMOptions,
	operationConfig?: {
		applicationId: string;
		type: ProcessingOperationType;
	}
): Promise<string> {
	const config = aiConfig.yandexGPT;

	// Создаем операцию, если указана конфигурация
	let operationId: string | undefined;
	if (operationConfig) {
		const operation = createOrUpdateOperation(
			operationConfig.applicationId,
			operationConfig.type,
			'yandex',
			{
				endpoint: config.endpoint!,
				method: 'POST'
			},
			'running'
		);
		operationId = operation.id;
	}

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
			throw new LLMError(
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
			const error = new LLMError('Не удалось извлечь текст из ответа YandexGPT');
			if (operationId) {
				updateOperationStatus(operationId, 'failed', {
					error: { message: error.message }
				});
			}
			throw error;
		}

		// Сохраняем результат в операцию
		if (operationId) {
			updateOperationStatus(operationId, 'completed', {
				result: { text }
			});
		}

		return text;
	} catch (error) {
		if (operationId) {
			updateOperationStatus(operationId, 'failed', {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					details: error
				}
			});
		}

		if (error instanceof LLMError) {
			throw error;
		}
		throw new LLMError('Ошибка при вызове YandexGPT API', error as Error);
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
 * @param operationConfig - Конфигурация операции (опционально)
 * @returns Валидированный объект, соответствующий схеме
 */
export async function callYandexGPTStructured<T extends z.ZodTypeAny>(
	prompt: string,
	schema: T,
	systemPrompt?: string,
	options?: LLMOptions,
	maxRetries: number = 2,
	operationConfig?: {
		applicationId: string;
		type: ProcessingOperationType;
	}
): Promise<z.infer<T>> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			// Добавляем инструкцию о формате JSON в промпт (если это не первая попытка)
			let enhancedPrompt = prompt;
			if (attempt > 0) {
				enhancedPrompt = `${prompt}\n\nВАЖНО: Верни ТОЛЬКО валидный JSON без дополнительного текста, комментариев или markdown разметки.`;
			}

			const response = await callYandexGPT(enhancedPrompt, systemPrompt, options, operationConfig);

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
				throw new LLMError(
					`Не удалось распарсить JSON из ответа LLM: ${(parseError as Error).message}. Ответ: ${jsonText.substring(0, 200)}`
				);
			}

			// Валидируем через Zod схему
			const validated = schema.parse(parsed);

			// Обновляем операцию с результатом (если она была создана)
			if (operationConfig) {
				const operation = getOperationByApplicationAndType(
					operationConfig.applicationId,
					operationConfig.type
				);
				if (operation) {
					updateOperationStatus(operation.id, 'completed', {
						result: validated
					});
				}
			}

			return validated;
		} catch (error) {
			lastError = error as Error;

			// Если это последняя попытка, выбрасываем ошибку
			if (attempt === maxRetries) {
				break;
			}

			// Иначе продолжаем попытки
			continue;
		}
	}

	// Если все попытки не удались, выбрасываем последнюю ошибку
	throw new LLMError(
		`Не удалось получить валидный structured output после ${maxRetries + 1} попыток`,
		lastError || undefined
	);
}
