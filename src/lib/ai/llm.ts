/**
 * Модуль LLM для работы с различными провайдерами
 *
 * Поддерживает:
 * - YandexGPT через REST API (через yandex/llm.ts)
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import { z } from 'zod';
import type { LLMOptions } from './types.js';
import type { ProcessingOperationType } from '../storage/types.js';
import {
	createOperation,
	updateOperation,
	getOperation,
	getOperationByApplicationAndType
} from '../storage/operationsRepository.js';
import { OperationAlreadyExistsError } from '../storage/errors.js';
import { logger } from '../utils/logger.js';
import {
	callYandexGPT as callYandexGPTImpl,
	callYandexGPTStructured as callYandexGPTStructuredImpl,
	YandexLLMError
} from './yandex/api-llm.js';

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
 * Вызывает LLM API и возвращает текстовый ответ
 * Использует switch по провайдеру для вызова соответствующей функции
 *
 * @param provider - Провайдер LLM ('yandex', и т.д.)
 * @param prompt - Промпт для LLM
 * @param systemPrompt - Системный промпт (опционально)
 * @param options - Параметры модели (temperature, maxTokens и т.д.)
 * @param operationConfig - Конфигурация операции (опционально)
 * @returns Текстовый ответ от LLM
 */
export async function callLLM(
	provider: string,
	prompt: string,
	systemPrompt?: string,
	options?: LLMOptions,
	operationConfig?: {
		applicationId: string;
		type: ProcessingOperationType;
	}
): Promise<string> {
	logger.debug('Вызов LLM', {
		provider,
		applicationId: operationConfig?.applicationId,
		operationType: operationConfig?.type,
		promptLength: prompt.length,
		hasSystemPrompt: !!systemPrompt
	});

	// Создаем операцию, если указана конфигурация
	let operationId: string | undefined;
	if (operationConfig) {
		try {
			const operation = createOperation(
				operationConfig.applicationId,
				operationConfig.type,
				provider,
				{} // providerData пустой для LLM операций
			);
			operationId = operation.id;
			logger.debug('Создана операция LLM', {
				operationId,
				applicationId: operationConfig.applicationId,
				type: operationConfig.type,
				provider
			});
		} catch (error) {
			if (error instanceof OperationAlreadyExistsError) {
				// Если операция уже существует, получаем её
				const existing = getOperationByApplicationAndType(
					operationConfig.applicationId,
					operationConfig.type
				);
				if (existing) {
					operationId = existing.id;
					logger.debug('Использована существующая операция LLM', {
						operationId,
						applicationId: operationConfig.applicationId,
						type: operationConfig.type
					});
				}
			} else {
				throw error;
			}
		}
	}

	try {
		let text: string;

		// Switch по провайдеру
		switch (provider) {
			case 'yandex': {
				text = await callYandexGPTImpl(prompt, systemPrompt, options);
				break;
			}

			default:
				throw new LLMError(`Неизвестный провайдер LLM: ${provider}`);
		}

		logger.info('LLM успешно вернул ответ', {
			provider,
			operationId,
			textLength: text.length
		});

		// Сохраняем результат в операцию
		if (operationId) {
			const current = getOperation(operationId);
			if (current) {
				updateOperation(operationId, {
					...current,
					status: 'completed',
					result: { text },
					completedAt: new Date().toISOString()
				});
			}
		}

		return text;
	} catch (error) {
		logger.error('Ошибка при вызове LLM', {
			provider,
			operationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});

		if (operationId) {
			const current = getOperation(operationId);
			if (current) {
				updateOperation(operationId, {
					...current,
					status: 'failed',
					result: {
						error: {
							message: error instanceof Error ? error.message : 'Unknown error',
							details: error
						}
					},
					completedAt: new Date().toISOString()
				});
			}
		}

		if (error instanceof YandexLLMError) {
			throw new LLMError(error.message, error.cause);
		}
		if (error instanceof LLMError) {
			throw error;
		}
		throw new LLMError('Ошибка при вызове LLM API', error as Error);
	}
}

/**
 * Вызывает LLM с structured output через Zod схему
 * Использует switch по провайдеру для вызова соответствующей функции
 *
 * Парсит JSON из ответа LLM и валидирует его через Zod схему.
 * Если парсинг или валидация не удались, делает повторную попытку с более строгим промптом.
 *
 * @param provider - Провайдер LLM ('yandex', и т.д.)
 * @param prompt - Промпт для LLM (должен содержать инструкцию возвращать JSON)
 * @param schema - Zod схема для валидации ответа
 * @param systemPrompt - Системный промпт (опционально)
 * @param options - Параметры модели
 * @param maxRetries - Максимальное количество попыток (по умолчанию 2)
 * @param operationConfig - Конфигурация операции (опционально)
 * @returns Валидированный объект, соответствующий схеме
 */
export async function callLLMStructured<T extends z.ZodTypeAny>(
	provider: string,
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
	logger.debug('Вызов LLM с structured output', {
		provider,
		applicationId: operationConfig?.applicationId,
		operationType: operationConfig?.type,
		maxRetries
	});

	// Создаем операцию, если указана конфигурация
	let operationId: string | undefined;
	if (operationConfig) {
		try {
			const operation = createOperation(
				operationConfig.applicationId,
				operationConfig.type,
				provider,
				{} // providerData пустой для LLM операций
			);
			operationId = operation.id;
			logger.debug('Создана операция LLM', {
				operationId,
				applicationId: operationConfig.applicationId,
				type: operationConfig.type,
				provider
			});
		} catch (error) {
			if (error instanceof OperationAlreadyExistsError) {
				// Если операция уже существует, получаем её
				const existing = getOperationByApplicationAndType(
					operationConfig.applicationId,
					operationConfig.type
				);
				if (existing) {
					operationId = existing.id;
					logger.debug('Использована существующая операция LLM', {
						operationId,
						applicationId: operationConfig.applicationId,
						type: operationConfig.type
					});
				}
			} else {
				throw error;
			}
		}
	}

	try {
		let validated: z.infer<T>;

		// Switch по провайдеру
		switch (provider) {
			case 'yandex': {
				validated = await callYandexGPTStructuredImpl(
					prompt,
					schema,
					systemPrompt,
					options,
					maxRetries
				);
				break;
			}

			default:
				throw new LLMError(`Неизвестный провайдер LLM: ${provider}`);
		}

		logger.info('Structured output успешно получен и валидирован', {
			provider,
			operationId,
			applicationId: operationConfig?.applicationId,
			operationType: operationConfig?.type
		});

		// Обновляем операцию с результатом (если она была создана)
		if (operationId) {
			const current = getOperation(operationId);
			if (current) {
				updateOperation(operationId, {
					...current,
					status: 'completed',
					result: validated,
					completedAt: new Date().toISOString()
				});
			}
		}

		return validated;
	} catch (error) {
		logger.error('Ошибка при получении structured output', {
			provider,
			operationId,
			applicationId: operationConfig?.applicationId,
			operationType: operationConfig?.type,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});

		if (operationId) {
			const current = getOperation(operationId);
			if (current) {
				updateOperation(operationId, {
					...current,
					status: 'failed',
					result: {
						error: {
							message: error instanceof Error ? error.message : 'Unknown error',
							details: error
						}
					},
					completedAt: new Date().toISOString()
				});
			}
		}

		if (error instanceof YandexLLMError) {
			throw new LLMError(error.message, error.cause);
		}
		if (error instanceof LLMError) {
			throw error;
		}
		throw new LLMError('Ошибка при получении structured output', error as Error);
	}
}

/**
 * Вызывает YandexGPT API и возвращает текстовый ответ
 * (Функция для обратной совместимости)
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
	return callLLM('yandex', prompt, systemPrompt, options, operationConfig);
}

/**
 * Вызывает YandexGPT с structured output через Zod схему
 * (Функция для обратной совместимости)
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
	return callLLMStructured(
		'yandex',
		prompt,
		schema,
		systemPrompt,
		options,
		maxRetries,
		operationConfig
	);
}
