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
import {
	createOperation,
	updateOperation,
	getOperation,
	getOperationByApplicationAndType
} from '../../storage/operationsRepository.js';
import type { ExtractTextResult } from '../ocr.js';
import { fetchStable } from '../../utils/fetchStable.js';
import { ok, err, Result, ResultAsync } from 'neverthrow';

export class YandexOCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexOCRError';
	}
}

import { z } from 'zod';

/**
 * Тип для описания операции Yandex Cloud в соответствии со спецификацией Google Long-Running Operation.
 */
export type YandexCloudOperation = z.infer<typeof YandexCloudOperationSchema>;

export const YandexCloudOperationSchema = z.object({
	id: z.string(),
	description: z.string().max(256),
	createdAt: z.string(),
	createdBy: z.string(),
	modifiedAt: z.string(),
	done: z.boolean(),
	metadata: z.record(z.unknown()),
	error: z
		.object({
			code: z.number().int(),
			message: z.string(),
			details: z.array(z.unknown())
		})
		.optional(),
	response: z.record(z.unknown()).optional()
}).refine(
	data =>
		(!data.error && !data.response) || // либо их вообще нет (Operation не завершена)
		(Boolean(data.done) && (Boolean(data.error) !== Boolean(data.response))), // либо done==true и только одно из них установлено
	{
		message: 'Если операция завершена (done==true), должно быть задано только одно из полей: error или response'
	}
);

// Схема результата распознавания текста Yandex OCR (YandexRecognitionResult)

export const YandexRecognitionResultSchema = z.object({
	// Page number в PDF на верхнем уровне объекта результата
	page: z.number().int().optional(),
	textAnnotation: z.object({
		page: z.number().int().optional(),
		width: z.number().int().optional(),
		height: z.number().int().optional(),
		blocks: z.array(z.unknown()).optional(),    // Можете уточнить BlockSchema при необходимости
		entities: z.array(z.unknown()).optional(),
		tables: z.array(z.unknown()).optional(),
		fullText: z.string().optional(),
		rotate: z.enum([
			'ANGLE_UNSPECIFIED',
			'ANGLE_0',
			'ANGLE_90',
			'ANGLE_180',
			'ANGLE_270'
		]).optional(),
		markdown: z.string().optional(),
		pictures: z.array(z.unknown()).optional()
	})
});

export type YandexRecognitionResult = z.infer<typeof YandexRecognitionResultSchema>;

function hasYandexCloudOperationDone(operation: ProcessingOperation): boolean {
	
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

// /**
//  * Извлекает текст из ответа Yandex OCR
//  */
// function extractTextFromResponse(result: unknown): string | undefined {
// 	// Синхронный ответ (одностраничные PDF, изображения)
// 	// Структура ответа: { result: { textAnnotation: { fullText: string } } }
// 	if (typeof result === 'object' && result !== null) {
// 		const obj = result as Record<string, unknown>;

// 		// Проверяем различные структуры ответа
// 		const resultObj = obj.result as Record<string, unknown> | undefined;
// 		const textAnnotation = resultObj?.textAnnotation as Record<string, unknown> | undefined;
// 		if (textAnnotation?.fullText) {
// 			return textAnnotation.fullText as string;
// 		}

// 		const directTextAnnotation = obj.textAnnotation as Record<string, unknown> | undefined;
// 		if (directTextAnnotation?.fullText) {
// 			return directTextAnnotation.fullText as string;
// 		}

// 		// Если текст не найден, пытаемся извлечь из блоков
// 		if (textAnnotation?.blocks) {
// 			const blocks = textAnnotation.blocks as Array<{
// 				lines?: Array<{ words?: Array<{ text: string }> }>;
// 			}>;
// 			const textBlocks: string[] = [];
// 			for (const block of blocks) {
// 				if (block.lines) {
// 					for (const line of block.lines) {
// 						if (line.words) {
// 							const words = line.words.map((w) => w.text).join(' ');
// 							textBlocks.push(words);
// 						}
// 					}
// 				}
// 			}
// 			return textBlocks.join('\n');
// 		}
// 	}
// 	return undefined;
// }

function getYandexRecognitionResult(result: unknown): Result<YandexRecognitionResult | YandexRecognitionResult[], YandexOCRError> {
	try {
		if (Array.isArray(result)) {
			const yandexRecognitionResults = result.map((item) => YandexRecognitionResultSchema.parse(item));
			return ok(yandexRecognitionResults as YandexRecognitionResult[]);
		} else {
			const yandexRecognitionResult = YandexRecognitionResultSchema.parse(result);
			return ok(yandexRecognitionResult as YandexRecognitionResult);
		}
	} catch (error) {
		return err(new YandexOCRError('Не удалось разобрать ответ YandexOCR как YandexRecognitionResult', error as Error));
	}
}

function getYandexRecognitionResultText(result: unknown): Result<string, YandexOCRError> {
	const yandexRecognitionResult = getYandexRecognitionResult(result);
	if (yandexRecognitionResult.isErr()) {
		return err(yandexRecognitionResult.error);
	}
	if (Array.isArray(yandexRecognitionResult.value)) {
		const text = yandexRecognitionResult.value.map((item) => item.textAnnotation.fullText).join('\n');
		return ok(text);
	} else {
		const text = yandexRecognitionResult.value.textAnnotation.fullText;
		if (!text) {
			return err(new YandexOCRError('Не удалось извлечь текст из ответа YandexOCR'));
		}
		return ok(text);
	}
}
/**
 * Отправляет изображение или PDF в YandexOCR
 * Создает операцию обработки и возвращает результат с явным типом
 *
 * @param applicationId - ID заявки
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
 * @param pageCount - Количество страниц (для PDF, если > 1, используется async endpoint)
 * @returns Результат извлечения текста с явным типом
 */
export async function callYandexOCR(
	applicationId: string,
	fileBuffer: Buffer,
	mimeType: string,
	pageCount?: number
): Promise<Result<ProcessingOperation, YandexOCRError>> {
	const config = aiConfig.yandexOCR;

	// Определяем, нужно ли использовать async endpoint
	const shouldUseAsyncRecognize: boolean = mimeType === 'application/pdf' && pageCount && pageCount > 1 ? true : false;
	const endpoint = shouldUseAsyncRecognize ? config.asyncEndpoint : config.endpoint;
	if (!endpoint) {
		return err(new YandexOCRError(`Не удалось получить endpoint для вызова YandexOCR API. 
			shouldUseAsyncRecognize: ${shouldUseAsyncRecognize}, 
			config.asyncEndpoint: ${config.asyncEndpoint}, 
			config.endpoint: ${config.endpoint}
		`));
	}

	logger.info('Извлечение текста через YandexOCR', {
		applicationId,
		mimeType,
		fileSize: fileBuffer.length,
		pageCount,
		shouldUseAsyncRecognize: shouldUseAsyncRecognize,
		asyncRecognizeEndpoint: endpoint
	});

	// Получаем операцию обработки или создаем новую
	let existingOperation = getOperationByApplicationAndType(applicationId, 'ocr');
	if (existingOperation.isErr()) {
		existingOperation = createOperation(applicationId, 'ocr', 'yandex', {});
		if (existingOperation.isErr()) {
			return err(new YandexOCRError('Не удалось создать операцию обработки', existingOperation.error));
		}
	}

	// TODO: Если асинхронная операция, то проверяем её статус и если завершена, то получаем результаты через GetRecognition
	if (shouldUseAsyncRecognize) {
		const recognitionResult = await fetchYandexOCRResult(existingOperation.value.providerData.operationId as string);
		////////////////////////////////////////////////////////////
	}

	// Формируем запрос к YandexOCR API
	const requestBody = createYandexOCRRequestBody(fileBuffer, mimeType);

	logger.debug('Отправка запроса в YandexOCR', {
		endpoint: endpoint
	});

	let response: Response;
	try {
		response = await fetchStable(
			endpoint,
			{
				method: 'POST',
				headers: {
					Authorization: `Api-Key ${config.apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			},
			60000, // timeout: 60 секунд для OCR запросов
			2 // maxRetries: 2 попытки при сетевых ошибках
		)
	} catch (error) {
		return err(new YandexOCRError('Не удалось вызвать YandexOCR API', error as Error));
	};

	if (!response.ok) {
		const json = await response.json();
		return err(new YandexOCRError(`YandexOCR API вернул ошибку: ${response.status} ${response.statusText}. ${JSON.stringify(json)}`));
	}
	const result = await response.json();

	// Асинхронный режим
	if (shouldUseAsyncRecognize) {
		try {
			const yandexCloudOperation = YandexCloudOperationSchema.parse(result);

			existingOperation.value.status = 'running';
			existingOperation.value.providerData.operationId = yandexCloudOperation.id;

			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
			if (updatedOperation.isOk()) {
				return ok(updatedOperation.value);
			} else {
				return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
			}
		} catch (error) {
			return err(new YandexOCRError('Не удалось разобрать ответ YandexOCR как YandexCloudOperation', error as Error));
		}


	} else { // Синхронный режим
		const text = getYandexRecognitionResultText(result);
		if (text.isErr()) {
			return err(new YandexOCRError(`Не удалось извлечь текст из ответа YandexOCR ${JSON.stringify(result)}`));
		}
		existingOperation.value.status = 'completed';
		existingOperation.value.result = { text: text.value };
		existingOperation.value.completedAt = new Date().toISOString();
		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
		if (updatedOperation.isOk()) {
			return ok(updatedOperation.value);
		} else {
			return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
		}
	}
}

/**
 * Получает результаты распознавания через GetRecognition endpoint и обновляет операцию обработки, если она еще не завершена
 *
 * @param operationId - ID операции у внешнего сервиса (Yandex)
 * @returns Операция обработки
 */
export async function fetchYandexOCRResult(operationId: string): Promise<Result<ProcessingOperation, YandexOCRError>> {
	const config = aiConfig.yandexOCR;
	const endpoint =
		config.getRecognitionEndpoint ||
		'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition';

	logger.debug('Получение результатов распознавания через GetRecognition', {
		operationId,
		endpoint
	});

	const existingOperation = getOperation(operationId);
	if (existingOperation.isErr()) {
		return err(new YandexOCRError('Не удалось получить операцию обработки', existingOperation.error));
	}

	if (existingOperation.value.status === 'completed') {
		return ok(existingOperation.value);
	}

	if (existingOperation.value.status === 'failed') {
		return err(new YandexOCRError('Операция обработки завершена с ошибкой', existingOperation.value.error));
	}

	let response: Response;
	try {
		response = await fetchStable(
			`${endpoint}?operationId=${operationId}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Api-Key ${config.apiKey}`,
					'Content-Type': 'application/json'
				}
			},
			30000, // timeout: 30 секунд для получения результатов
			2 // maxRetries: 2 попытки при сетевых ошибках
		);
		if (!response.ok) {
			const json = await response.json();
			return err(new YandexOCRError(`YandexOCR GetRecognition API вернул ошибку: ${response.status} ${response.statusText}. ${JSON.stringify(json)}`));
		}
	} catch (error) {
		return err(new YandexOCRError('Не удалось получить ответ от GetRecognition', error as Error));
	}
	const result = response.json();

	const yandexRecognitionResult = getYandexRecognitionResultText(result);
	if (yandexRecognitionResult.isErr()) {
		return err(new YandexOCRError('Не удалось извлечь текст из ответа GetRecognition', yandexRecognitionResult.error));
	}

	// Обновляем операцию обработки
	existingOperation.value.status = 'completed';
	existingOperation.value.result = { text: yandexRecognitionResult.value };
	existingOperation.value.completedAt = new Date().toISOString();
	const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
	if (updatedOperation.isOk()) {

		logger.info('Текст успешно получен и обновлена операция обработки через GetRecognition', {
			operationId,
			textLength: yandexRecognitionResult.value.length
		});
		return ok(updatedOperation.value);
	} else {
		return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
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
		const response = await fetchStable(
			operationEndpoint,
			{
				method: 'GET',
				headers: {
					Authorization: `Api-Key ${config.apiKey}`
				}
			},
			30000, // timeout: 30 секунд для проверки статуса операции
			2 // maxRetries: 2 попытки при сетевых ошибках
		);

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
				const text = await fetchYandexOCRResult(operationId);
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

