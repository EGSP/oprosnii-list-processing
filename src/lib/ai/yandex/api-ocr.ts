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
	getOperationByApplicationAndType,
	getOperation
} from '../../storage/operationsRepository.js';
import { fetchStable } from '../../utils/fetchStable.js';
import { ok, err, Result } from 'neverthrow';


import { z } from 'zod';
import { type YandexCloudOperation, YandexCloudOperationSchema } from './api.js';


const RECOGNIZE_TEXT_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
const RECOGNIZE_TEXT_ASYNC_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeTextAsync';
const GET_RECOGNITION_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/getRecognition';

export class YandexOCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexOCRError';
	}
}

// Схема результата распознавания текста Yandex OCR (YandexRecognitionResult)

export type YandexRecognitionResult = z.infer<typeof YandexRecognitionResultSchema>;
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

async function fetchYandexCloudOperation(yandexCloudOperation: YandexCloudOperation): Promise<Result<YandexCloudOperation, YandexOCRError>> {
	const response = await fetchStable(
		`${aiConfig.yandexOCR.operationEndpoint}/${yandexCloudOperation.id}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${aiConfig.yandexOCR.apiKey}`
			}
		},
		30000, // timeout: 30 секунд для получения результатов
		2 // maxRetries: 2 попытки при сетевых ошибках
	);
	if (!response.ok) {
		return err(new YandexOCRError(`YandexOCR Operation API вернул ошибку: ${response.status} ${response.statusText}`));
	}
	const result = await response.json();
	try {
		const newYandexCloudOperation = YandexCloudOperationSchema.parse(result);
		return ok(newYandexCloudOperation);
	} catch (error) {
		return err(new YandexOCRError('Не удалось разобрать ответ YandexOCR как YandexCloudOperation', error as Error));
	}
};

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

function toString(yandexRecognitionResult: YandexRecognitionResult | YandexRecognitionResult[]): Result<string, YandexOCRError> {
	if (Array.isArray(yandexRecognitionResult)) {
		const text = yandexRecognitionResult.map((item) => item.textAnnotation.fullText).join('\n');
		return ok(text);
	} else {
		const text = yandexRecognitionResult.textAnnotation.fullText;
		if (!text) {
			return err(new YandexOCRError('Не удалось извлечь текст из ответа YandexOCR'));
		}
		return ok(text);
	}
}

function toYandexRecognition(result: unknown): Result<YandexRecognitionResult | YandexRecognitionResult[], YandexOCRError> {
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

	// Получаем операцию обработки или создаем новую
	let existingOperation = getOperationByApplicationAndType(applicationId, 'ocr');
	if (existingOperation.isErr()) {
		existingOperation = createOperation(applicationId, 'ocr', 'yandex', {});
		if (existingOperation.isErr()) {
			return err(new YandexOCRError('Не удалось создать операцию обработки', existingOperation.error));
		}
	}

	// Если асинхронная операция уже существует, то проверяем её статус и если завершена, то получаем результаты через GetRecognition
	const yandexCloudOperation = existingOperation.value.providerData.yandexCloudOperation as YandexCloudOperation | undefined;
	if (yandexCloudOperation?.id) {
		const updatedYandexCloudOperation = await fetchYandexCloudOperation(yandexCloudOperation);
		if (updatedYandexCloudOperation.isErr()) {
			return err(new YandexOCRError('Не удалось получить результаты асинхронной операции', updatedYandexCloudOperation.error));
		}
		existingOperation.value.providerData.yandexCloudOperation = updatedYandexCloudOperation.value;
		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
		if (updatedOperation.isErr()) {
			return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
		}

		if (updatedYandexCloudOperation.value.done) {
			const recognitionResult = await fetchYandexRecognition(updatedYandexCloudOperation.value);
			if (recognitionResult.isErr()) {
				return err(new YandexOCRError('Не удалось получить результаты распознавания', recognitionResult.error));
			}
			const text = toString(recognitionResult.value);
			if (text.isErr()) {
				return err(new YandexOCRError('Не удалось извлечь текст из результатов распознавания', text.error));
			}

			existingOperation.value.status = 'completed';
			existingOperation.value.result = { text: text.value };
			existingOperation.value.completedAt = new Date().toISOString();
			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
			if (updatedOperation.isErr()) {
				return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
			}
		}
		return ok(updatedOperation.value);
	}

	// Создаем новый запрос в YandexOCR

	logger.info('Извлечение текста через YandexOCR', {
		applicationId,
		mimeType,
		fileSize: fileBuffer.length,
		pageCount
	});

	const shouldUseAsyncRecognize = mimeType === 'application/pdf' && pageCount && pageCount > 1 ? true : false;

	const endpoint = shouldUseAsyncRecognize ? config.asyncEndpoint : config.endpoint;
	if (!endpoint) {
		return err(new YandexOCRError(`Не удалось получить endpoint для вызова YandexOCR API. 
			shouldUseAsyncRecognize: ${shouldUseAsyncRecognize}, 
			config.asyncEndpoint: ${config.asyncEndpoint}, 
			config.endpoint: ${config.endpoint}
		`));
	}

	// Формируем запрос к YandexOCR API
	const requestBody = createYandexOCRRequestBody(fileBuffer, mimeType);
	let response: Response;
	try {
		response = await fetchStable(
			config.endpoint!,
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
			existingOperation.value.providerData.yandexCloudOperation = yandexCloudOperation;

			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
			if (updatedOperation.isErr()) {
				return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
			}
			return ok(updatedOperation.value);
		} catch (error) {
			return err(new YandexOCRError('Не удалось разобрать ответ YandexOCR как YandexCloudOperation', error as Error));
		}
	} else { // Синхронный режим
		const yandexRecognitionResult = toYandexRecognition(result);
		if (yandexRecognitionResult.isErr()) {
			return err(new YandexOCRError(`Не удалось разобрать ответ YandexOCR как YandexRecognitionResult`, yandexRecognitionResult.error));
		}
		const text = toString(yandexRecognitionResult.value);
		if (text.isErr()) {
			return err(new YandexOCRError('Не удалось извлечь текст из результатов распознавания', text.error));
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
export async function fetchYandexRecognition(yandexCloudOperation: YandexCloudOperation):
	Promise<Result<YandexRecognitionResult | YandexRecognitionResult[], YandexOCRError>> {
	const config = aiConfig.yandexOCR;
	const endpoint =
		config.getRecognitionEndpoint ||
		'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition';

	logger.debug('Получение результатов распознавания через GetRecognition', {
		yandexCloudOperationId: yandexCloudOperation.id,
		endpoint
	});

	let response: Response;
	try {
		response = await fetchStable(
			`${endpoint}?operationId=${yandexCloudOperation.id}`,
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

	const yandexRecognitionResult = toYandexRecognition(result);
	if (yandexRecognitionResult.isErr()) {
		return err(new YandexOCRError('Не удалось разобрать ответ GetRecognition как YandexRecognitionResult', yandexRecognitionResult.error));
	}

	return ok(yandexRecognitionResult.value);
}

export async function checkYandexOCROperation(operationId: string): Promise<Result<ProcessingOperation, YandexOCRError>> {

	const existingOperation = getOperation(operationId);
	if (existingOperation.isErr()) {
		return err(new YandexOCRError('Операция не найдена', existingOperation.error));
	}
	// Если асинхронная операция уже существует, то проверяем её статус и если завершена, то получаем результаты через GetRecognition
	const yandexCloudOperation = existingOperation.value.providerData.yandexCloudOperation as YandexCloudOperation | undefined;
	if (yandexCloudOperation?.id) {
		const updatedYandexCloudOperation = await fetchYandexCloudOperation(yandexCloudOperation);
		if (updatedYandexCloudOperation.isErr()) {
			return err(new YandexOCRError('Не удалось получить результаты асинхронной операции', updatedYandexCloudOperation.error));
		}
		existingOperation.value.providerData.yandexCloudOperation = updatedYandexCloudOperation.value;
		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
		if (updatedOperation.isErr()) {
			return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
		}

		if (updatedYandexCloudOperation.value.done) {
			const recognitionResult = await fetchYandexRecognition(updatedYandexCloudOperation.value);
			if (recognitionResult.isErr()) {
				return err(new YandexOCRError('Не удалось получить результаты распознавания', recognitionResult.error));
			}
			const text = toString(recognitionResult.value);
			if (text.isErr()) {
				return err(new YandexOCRError('Не удалось извлечь текст из результатов распознавания', text.error));
			}

			existingOperation.value.status = 'completed';
			existingOperation.value.result = { text: text.value };
			existingOperation.value.completedAt = new Date().toISOString();
			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
			if (updatedOperation.isErr()) {
				return err(new YandexOCRError('Не удалось обновить операцию обработки', updatedOperation.error));
			}
		}
		return ok(updatedOperation.value);
	}
	return ok(existingOperation.value);
}