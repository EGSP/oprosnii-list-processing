/**
 * Модуль Yandex OCR
 *
 * Функции для работы с Yandex OCR API:
 * - Распознавание текста из изображений и PDF
 * - Проверка статуса асинхронных операций
 * - Получение результатов распознавания
 */

import { aiConfig } from '../config.js';
import { logger } from '../../utils/logger.js';
import type { ProcessingOperation } from '../../storage/types.js';

export class YandexOCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexOCRError';
	}
}

/**
 * Создает тело запроса для Yandex OCR API
 */
function createYandexOCRRequestBody(fileBuffer: Buffer, mimeType: string): Record<string, unknown> {
	const config = aiConfig.yandexOCR;
	const base64Content = fileBuffer.toString('base64');

	// Определяем тип контента для API
	let contentType: string;
	if (mimeType.startsWith('image/')) {
		contentType = mimeType;
	} else if (mimeType === 'application/pdf') {
		contentType = 'application/pdf';
	} else {
		throw new YandexOCRError(`Неподдерживаемый тип файла для OCR: ${mimeType}`);
	}

	return {
		content: base64Content,
		mime_type: contentType,
		language_codes: ['ru', 'en'],
		model: config.model
	};
}

/**
 * Извлекает текст из ответа Yandex OCR
 */
function extractTextFromResponse(result: unknown): string | undefined {
	// Синхронный ответ (одностраничные PDF, изображения)
	// Структура ответа: { result: { textAnnotation: { fullText: string } } }
	if (typeof result === 'object' && result !== null) {
		const obj = result as Record<string, unknown>;
		
		// Проверяем различные структуры ответа
		if (obj.result?.textAnnotation?.fullText) {
			return obj.result.textAnnotation.fullText as string;
		}
		if (obj.textAnnotation?.fullText) {
			return obj.textAnnotation.fullText as string;
		}
		
		// Если текст не найден, пытаемся извлечь из блоков
		if (obj.result?.textAnnotation?.blocks) {
			const blocks = obj.result.textAnnotation.blocks as Array<{
				lines?: Array<{ words?: Array<{ text: string }> }>;
			}>;
			const textBlocks: string[] = [];
			for (const block of blocks) {
				if (block.lines) {
					for (const line of block.lines) {
						if (line.words) {
							const words = line.words.map((w) => w.text).join(' ');
							textBlocks.push(words);
						}
					}
				}
			}
			return textBlocks.join('\n');
		}
	}
	return undefined;
}

/**
 * Отправляет изображение или PDF в YandexOCR
 * Возвращает результат синхронно или Operation ID для асинхронных операций
 *
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
 * @param pageCount - Количество страниц (для PDF, если > 1, используется async endpoint)
 * @returns Результат с текстом (если синхронно) или operationId (если асинхронно)
 */
export async function callYandexOCR(
	fileBuffer: Buffer,
	mimeType: string,
	pageCount?: number
): Promise<{ text?: string; operationId?: string }> {
	const config = aiConfig.yandexOCR;

	// Определяем, нужно ли использовать async endpoint
	const isMultiPagePDF = mimeType === 'application/pdf' && pageCount && pageCount > 1;
	const endpoint = isMultiPagePDF && config.asyncEndpoint ? config.asyncEndpoint : config.endpoint;

	logger.debug('Вызов YandexOCR', {
		mimeType,
		fileSize: fileBuffer.length,
		pageCount,
		isMultiPagePDF,
		endpoint
	});

	// Формируем запрос к YandexOCR API
	const requestBody = createYandexOCRRequestBody(fileBuffer, mimeType);

	try {
		logger.debug('Отправка запроса в YandexOCR', {
			endpoint,
			mimeType,
			pageCount
		});

		const response = await fetch(endpoint!, {
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR API вернул ошибку', {
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new YandexOCRError(
				`YandexOCR API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		// Для async endpoint: всегда возвращает { done: false, id: "..." } при создании операции
		if (isMultiPagePDF) {
			if (result.done === false && result.id) {
				logger.info('YandexOCR async операция создана', {
					operationId: result.id
				});
				return {
					operationId: result.id
				};
			}
			// Если async endpoint вернул что-то неожиданное
			logger.error('Неожиданный ответ от async endpoint', {
				responseStructure: JSON.stringify(result).substring(0, 200)
			});
			throw new YandexOCRError('Неожиданный ответ от async endpoint YandexOCR');
		}

		// Для синхронного endpoint: проверяем завершенные операции (для обратной совместимости)
		if (result.done === true && result.response) {
			const text = extractTextFromResponse(result.response);
			if (text) {
				logger.info('YandexOCR успешно извлек текст (синхронная операция завершена)', {
					textLength: text.length
				});
				return { text };
			}
		}

		// Синхронный ответ (одностраничные PDF, изображения)
		const text = extractTextFromResponse(result);
		if (text) {
			logger.info('YandexOCR успешно извлек текст (синхронная операция)', {
				textLength: text.length
			});
			return { text };
		}

		logger.error('Не удалось извлечь текст из ответа YandexOCR', {
			responseStructure: JSON.stringify(result).substring(0, 200)
		});
		throw new YandexOCRError('Не удалось извлечь текст из ответа YandexOCR');
	} catch (error) {
		if (error instanceof YandexOCRError) {
			logger.error('Ошибка YandexOCRError', {
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при вызове YandexOCR', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new YandexOCRError('Ошибка при вызове YandexOCR API', error as Error);
	}
}

/**
 * Получает результаты распознавания через GetRecognition endpoint
 *
 * @param operationId - ID операции у внешнего сервиса (Yandex)
 * @returns Извлеченный текст
 */
export async function getYandexOCRRecognition(operationId: string): Promise<string> {
	const config = aiConfig.yandexOCR;
	const endpoint =
		config.getRecognitionEndpoint ||
		'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition';

	logger.debug('Получение результатов распознавания через GetRecognition', {
		operationId,
		endpoint
	});

	try {
		const response = await fetch(`${endpoint}?operationId=${operationId}`, {
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR GetRecognition API вернул ошибку', {
				operationId,
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new YandexOCRError(
				`YandexOCR GetRecognition API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();
		const text = extractTextFromResponse(result);

		if (!text) {
			logger.error('Не удалось извлечь текст из ответа GetRecognition', {
				operationId,
				responseStructure: JSON.stringify(result).substring(0, 200)
			});
			throw new YandexOCRError('Не удалось извлечь текст из ответа GetRecognition');
		}

		logger.info('Текст успешно получен через GetRecognition', {
			operationId,
			textLength: text.length
		});

		return text;
	} catch (error) {
		if (error instanceof YandexOCRError) {
			logger.error('Ошибка YandexOCRError при получении результатов', {
				operationId,
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при получении результатов GetRecognition', {
			operationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new YandexOCRError('Ошибка при получении результатов GetRecognition', error as Error);
	}
}

/**
 * Проверяет статус асинхронной операции YandexOCR
 *
 * @param operation - Операция обработки с providerData.operationId
 * @returns Статус операции: done (завершена ли), text (если завершена), error (если ошибка)
 */
export async function checkYandexOCROperation(operation: ProcessingOperation): Promise<{
	done: boolean;
	text?: string;
	error?: string;
}> {
	const operationId = operation.providerData?.operationId as string | undefined;
	if (!operationId) {
		throw new YandexOCRError('Operation ID не найден в providerData');
	}

	const config = aiConfig.yandexOCR;
	const baseEndpoint =
		config.operationEndpoint || 'https://operation.api.cloud.yandex.net/operations';
	const operationEndpoint = `${baseEndpoint}/${operationId}`;

	logger.debug('Проверка статуса YandexOCR операции', {
		operationId: operation.id,
		externalOperationId: operationId,
		operationEndpoint
	});

	try {
		const response = await fetch(operationEndpoint, {
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR Operation API вернул ошибку', {
				operationId: operation.id,
				externalOperationId: operationId,
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new YandexOCRError(
				`YandexOCR Operation API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		if (result.done === true) {
			// Операция завершена, получаем результаты через GetRecognition
			logger.debug('Операция завершена, получаем результаты через GetRecognition', {
				operationId: operation.id,
				externalOperationId: operationId
			});

			try {
				const text = await getYandexOCRRecognition(operationId);
				logger.info('YandexOCR операция завершена успешно', {
					operationId: operation.id,
					externalOperationId: operationId,
					textLength: text.length
				});

				return {
					done: true,
					text
				};
			} catch (error) {
				logger.error('Ошибка при получении результатов через GetRecognition', {
					operationId: operation.id,
					externalOperationId: operationId,
					error: error instanceof Error ? error.message : String(error)
				});
				// Пробуем извлечь текст из response, если есть (fallback)
				if (result.response) {
					const text = extractTextFromResponse(result.response);
					if (text) {
						logger.info('Использован fallback: текст извлечен из Operation.Get ответа', {
							operationId: operation.id,
							externalOperationId: operationId,
							textLength: text.length
						});
						return {
							done: true,
							text
						};
					}
				}
				// Если не удалось получить текст, возвращаем ошибку
				return {
					done: true,
					error: error instanceof Error ? error.message : 'Ошибка при получении результатов'
				};
			}
		}

		if (result.error) {
			logger.error('YandexOCR операция завершена с ошибкой', {
				operationId: operation.id,
				externalOperationId: operationId,
				error: result.error.message || 'Unknown error'
			});
			return {
				done: true,
				error: result.error.message || 'Unknown error'
			};
		}

		// Операция еще выполняется
		logger.debug('YandexOCR операция еще выполняется', {
			operationId: operation.id,
			externalOperationId: operationId
		});
		return {
			done: false
		};
	} catch (error) {
		if (error instanceof YandexOCRError) {
			logger.error('Ошибка YandexOCRError при проверке статуса', {
				operationId: operation.id,
				externalOperationId: operationId,
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при проверке статуса операции YandexOCR', {
			operationId: operation.id,
			externalOperationId: operationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new YandexOCRError('Ошибка при проверке статуса операции YandexOCR', error as Error);
	}
}

