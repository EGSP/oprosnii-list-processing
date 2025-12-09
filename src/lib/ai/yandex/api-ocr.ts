/**
 * Модуль Yandex OCR
 *
 * Функции для работы с Yandex OCR API:
 * - Распознавание текста из изображений и PDF
 * - Проверка статуса асинхронных операций
 * - Получение результатов распознавания
 */

import { fetchStable } from '../../utils/fetchStable.js';
import { ok, err, Result } from 'neverthrow';

import { z } from 'zod';
import {type YandexCloudOperation, YandexCloudOperationSchema } from './api.js';

const RECOGNIZE_TEXT_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
const RECOGNIZE_TEXT_ASYNC_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeTextAsync';
const GET_RECOGNITION_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/getRecognition';

export class YandexCloudOCRAPIError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexCloudOCRAPIError';
	}
}

export type YandexOCRMimeType = z.infer<typeof YandexOCRMimeTypeEnum>;
export const YandexOCRMimeTypeEnum = z.enum(['image/jpeg', 'image/png', 'application/pdf']);


// Список моделей для распознавания текста и документов Yandex OCR API
export type YandexOCRModel = z.infer<typeof YandexOCRModelEnum>;
export const YandexOCRModelEnum = z.enum([
	// Модели для общего распознавания текста
	"page",                   // Подойдет для изображений с текстом в одну колонку (по умолчанию)
	"page-column-sort",       // Для многоколоночного текста
	"handwritten",            // Для сочетания печатного и рукописного текста (ru, en)
	"table",                  // Для распознавания таблиц (ru, en)
	"markdown",               // Включает результат в формате Markdown
	"math-markdown",          // Распознаёт формулы, результат с фрагментами LaTeX

	// Модели для шаблонных документов
	"passport",                      // Основной разворот паспорта
	"driver-license-front",          // Водительское удостоверение, лицевая сторона
	"driver-license-back",           // Водительское удостоверение, обратная сторона
	"vehicle-registration-front",    // Свидетельство о регистрации ТС, лицевая сторона
	"vehicle-registration-back",     // Свидетельство о регистрации ТС, обратная сторона
	"license-plates"                 // Все автомобильные номера на изображении
]);


/**
 * Схема тела запроса для Yandex OCR API
 */
export type YandexOCRRequestBody = z.infer<typeof YandexOCRRequestBodySchema>;
export const YandexOCRRequestBodySchema = z.object({
	content: z.string().describe('Bytes with data (base64-encoded file content)'),
	mimeType: YandexOCRMimeTypeEnum.describe('MIME type of the file (JPEG, PNG, PDF)'),
	languageCodes: z.array(z.string()).describe('Languages to recognize, ISO 639-1 codes (e.g., "ru", "en")'),
	model: YandexOCRModelEnum.describe('Модель для задачи распознавания текста или шаблонного документа')
});

// Схема результата распознавания текста Yandex OCR (YandexOCRRecognitionResult)
export type YandexOCRRecognitionResult = z.infer<typeof YandexOCRRecognitionResultSchema>;
export const YandexOCRRecognitionResultSchema = z.union([
	z.object({
		page: z.number().int().optional(),
		textAnnotation: z.object({
			page: z.number().int().optional(),
			width: z.number().int().optional(),
			height: z.number().int().optional(),
			blocks: z.array(z.unknown()).optional(),
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
	}),
	z.array(z.object({
		page: z.number().int().optional(),
		textAnnotation: z.object({
			page: z.number().int().optional(),
			width: z.number().int().optional(),
			height: z.number().int().optional(),
			blocks: z.array(z.unknown()).optional(),
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
	}))
]);

/**
 * Создает тело запроса для Yandex OCR API
 */
function createYandexOCRRequestBody(
	fileBuffer: Buffer,
	mimeType: YandexOCRMimeType,
	model?: YandexOCRModel
): Result<YandexOCRRequestBody, YandexCloudOCRAPIError> {
	const base64Content = fileBuffer.toString('base64');

	const result = YandexOCRRequestBodySchema.safeParse({
		content: base64Content,
		mimeType,
		languageCodes: ['ru', 'en'],
		model: model ? model : YandexOCRModelEnum.options[0]
	});
	if (result.success) {
		return ok(result.data as YandexOCRRequestBody);
	} else {
		return err(new YandexCloudOCRAPIError(`Не удалось создать тело запроса для Yandex OCR API: ${result.error}`));
	}
}

/**
 * Распознает текст из изображения или PDF через Yandex OCR API (синхронный endpoint)
 *
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла (image/jpeg, image/png, application/pdf)
 * @param model - Опциональная модель для распознавания (по умолчанию "page")
 * @returns Result с результатом распознавания при успехе или Error при ошибке
 */
export async function recognizeText(
	apiKey: string,
	fileBuffer: Buffer,
	mimeType: YandexOCRMimeType,
	model?: YandexOCRModel
): Promise<Result<YandexOCRRecognitionResult, YandexCloudOCRAPIError>> {
	// Создаем тело запроса
	const requestBodyResult = createYandexOCRRequestBody(fileBuffer, mimeType, model);
	if (requestBodyResult.isErr()) {
		return err(new YandexCloudOCRAPIError(`Не удалось создать тело запроса для Yandex OCR API: ${requestBodyResult.error}`));
	}

	const requestBody = requestBodyResult.value;

	// Выполняем запрос
	const responseResult = await fetchStable(
		RECOGNIZE_TEXT_ENDPOINT,
		{
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		},
		60000, // timeout: 60 секунд для OCR запросов
		2 // maxRetries: 2 попытки при сетевых ошибках
	);

	if (responseResult.isErr()) {
		return err(
			new YandexCloudOCRAPIError(
				`Не удалось выполнить запрос к Yandex OCR API: ${responseResult.error.message}`,
				responseResult.error
			)
		);
	}

	const response = responseResult.value;

	if (!response.ok) {
		let errorMessage = `Yandex OCR API вернул ошибку: ${response.status} ${response.statusText}`;
		try {
			const errorBody = await response.json();
			errorMessage += `. ${JSON.stringify(errorBody)}`;
		} catch {
			// Игнорируем ошибку парсинга тела ответа
		}
		return err(new YandexCloudOCRAPIError(errorMessage));
	}
	const result = await response.json();

	try {
		const recognitionResult = YandexOCRRecognitionResultSchema.parse(result);
		return ok(recognitionResult);
	} catch (error) {
		return err(
			new YandexCloudOCRAPIError(
				'Не удалось валидировать ответ Yandex OCR API как YandexOCRRecognitionResult',
				error as Error
			)
		);
	}
}

export async function recognizeTextAsync(
	apiKey: string,
	fileBuffer: Buffer,
	mimeType: YandexOCRMimeType,
	model?: YandexOCRModel
): Promise<Result<YandexCloudOperation, YandexCloudOCRAPIError>> {
	// Создаем тело запроса
	const requestBodyResult = createYandexOCRRequestBody(fileBuffer, mimeType, model);
	if (requestBodyResult.isErr()) {
		return err(new YandexCloudOCRAPIError(`Не удалось создать тело запроса для Yandex OCR API: ${requestBodyResult.error}`));
	}

	const requestBody = requestBodyResult.value;

	// Выполняем запрос
	const responseResult = await fetchStable(
		RECOGNIZE_TEXT_ASYNC_ENDPOINT,
		{
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		},
		60000, // timeout: 60 секунд для OCR запросов
		2 // maxRetries: 2 попытки при сетевых ошибках
	);

	if (responseResult.isErr()) {
		return err(
			new YandexCloudOCRAPIError(
				`Не удалось выполнить запрос к Yandex OCR API: ${responseResult.error.message}`,
				responseResult.error
			)
		);
	}

	const response = responseResult.value;

	if (!response.ok) {
		let errorMessage = `Yandex OCR API вернул ошибку: ${response.status} ${response.statusText}`;
		try {
			const errorBody = await response.json();
			errorMessage += `. ${JSON.stringify(errorBody)}`;
		} catch {
			// Игнорируем ошибку парсинга тела ответа
		}
		return err(new YandexCloudOCRAPIError(errorMessage));
	}
	const result = await response.json();

	try {
		const yandexCloudOperation = YandexCloudOperationSchema.parse(result);
		return ok(yandexCloudOperation);
	} catch (error) {
		return err(
			new YandexCloudOCRAPIError(
				'Не удалось валидировать ответ Yandex OCR API как YandexCloudOperation',
				error as Error
			)
		);
	}
}

export async function getRecognition(
	apiKey: string,
	operation: YandexCloudOperation
): Promise<Result<YandexOCRRecognitionResult, YandexCloudOCRAPIError>> {
	const responseResult = await fetchStable(
		`${GET_RECOGNITION_ENDPOINT}?operationId=${operation.id}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${apiKey}`
			}
		},
		60000, // timeout: 60 секунд для OCR запросов
		2 // maxRetries: 2 попытки при сетевых ошибках
	)

	if (responseResult.isErr()) {
		return err(new YandexCloudOCRAPIError(`Не удалось выполнить запрос к Yandex OCR API: ${responseResult.error.message}`, responseResult.error));
	}

	const response = responseResult.value;
	if (!response.ok) {
		return err(new YandexCloudOCRAPIError(`Yandex OCR API вернул ошибку: ${response.status} ${response.statusText}`));
	}
	const result = await response.json();

	try {
		const recognitionResult = YandexOCRRecognitionResultSchema.parse(result);
		return ok(recognitionResult);
	} catch (error) {
		return err(new YandexCloudOCRAPIError('Не удалось валидировать ответ Yandex OCR API как YandexOCRRecognitionResult', error as Error));
	}
}


// function toYandexRecognition(result: unknown): Result<YandexOCRRecognitionResult | YandexOCRRecognitionResult[], YandexCloudOCRAPIError> {
// 	try {
// 		if (Array.isArray(result)) {
// 			const yandexRecognitionResults = result.map((item) => YandexOCRRecognitionResultSchema.parse(item));
// 			return ok(yandexRecognitionResults as YandexOCRRecognitionResult[]);
// 		} else {
// 			const yandexRecognitionResult = YandexOCRRecognitionResultSchema.parse(result);
// 			return ok(yandexRecognitionResult as YandexOCRRecognitionResult);
// 		}
// 	} catch (error) {
// 		return err(new YandexCloudOCRAPIError('Не удалось разобрать ответ YandexOCR как YandexRecognitionResult', error as Error));
// 	}
// }
// /**
//  * Отправляет изображение или PDF в YandexOCR
//  * Создает операцию обработки и возвращает результат с явным типом
//  *
//  * @param applicationId - ID заявки
//  * @param fileBuffer - Buffer с содержимым файла
//  * @param mimeType - MIME тип файла
//  * @param pageCount - Количество страниц (для PDF, если > 1, используется async endpoint)
//  * @returns Результат извлечения текста с явным типом
//  */
// export async function callYandexOCR(
// 	applicationId: string,
// 	fileBuffer: Buffer,
// 	mimeType: string,
// 	pageCount?: number
// ): Promise<Result<ProcessingOperation, YandexCloudOCRAPIError>> {
// 	const config = aiConfig.yandexOCR;

// 	// Получаем операцию обработки или создаем новую
// 	let existingOperation = getOperationByApplicationAndType(applicationId, 'ocr');
// 	if (existingOperation.isErr()) {
// 		existingOperation = createOperation(applicationId, 'ocr', 'yandex', {});
// 		if (existingOperation.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось создать операцию обработки', existingOperation.error));
// 		}
// 	}

// 	// Если асинхронная операция уже существует, то проверяем её статус и если завершена, то получаем результаты через GetRecognition
// 	const yandexCloudOperation = existingOperation.value.providerData.yandexCloudOperation as YandexCloudOperation | undefined;
// 	if (yandexCloudOperation?.id) {
// 		const updatedYandexCloudOperation = await getYandexCloudOperation(yandexCloudOperation.id, config.apiKey);
// 		if (updatedYandexCloudOperation.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось получить результаты асинхронной операции', updatedYandexCloudOperation.error));
// 		}
// 		existingOperation.value.providerData.yandexCloudOperation = updatedYandexCloudOperation.value;
// 		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 		if (updatedOperation.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 		}

// 		if (updatedYandexCloudOperation.value.done) {
// 			const recognitionResult = await fetchYandexRecognition(updatedYandexCloudOperation.value);
// 			if (recognitionResult.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось получить результаты распознавания', recognitionResult.error));
// 			}
// 			const text = toString(recognitionResult.value);
// 			if (text.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось извлечь текст из результатов распознавания', text.error));
// 			}

// 			existingOperation.value.status = 'completed';
// 			existingOperation.value.result = { text: text.value };
// 			existingOperation.value.completedAt = new Date().toISOString();
// 			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 			if (updatedOperation.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 			}
// 		}
// 		return ok(updatedOperation.value);
// 	}

// 	// Создаем новый запрос в YandexOCR

// 	logger.info('Извлечение текста через YandexOCR', {
// 		applicationId,
// 		mimeType,
// 		fileSize: fileBuffer.length,
// 		pageCount
// 	});

// 	const shouldUseAsyncRecognize = mimeType === 'application/pdf' && pageCount && pageCount > 1 ? true : false;

// 	const endpoint = shouldUseAsyncRecognize ? config.asyncEndpoint : config.endpoint;
// 	if (!endpoint) {
// 		return err(new YandexCloudOCRAPIError(`Не удалось получить endpoint для вызова YandexOCR API.
// 			shouldUseAsyncRecognize: ${shouldUseAsyncRecognize},
// 			config.asyncEndpoint: ${config.asyncEndpoint},
// 			config.endpoint: ${config.endpoint}
// 		`));
// 	}

// 	// Формируем запрос к YandexOCR API
// 	const requestBody = createYandexOCRRequestBody(fileBuffer, mimeType);
// 	let response: Response;
// 	try {
// 		response = await fetchStable(
// 			config.endpoint!,
// 			{
// 				method: 'POST',
// 				headers: {
// 					Authorization: `Api-Key ${config.apiKey}`,
// 					'Content-Type': 'application/json'
// 				},
// 				body: JSON.stringify(requestBody)
// 			},
// 			60000, // timeout: 60 секунд для OCR запросов
// 			2 // maxRetries: 2 попытки при сетевых ошибках
// 		)
// 	} catch (error) {
// 		return err(new YandexCloudOCRAPIError('Не удалось вызвать YandexOCR API', error as Error));
// 	};

// 	if (!response.ok) {
// 		const json = await response.json();
// 		return err(new YandexCloudOCRAPIError(`YandexOCR API вернул ошибку: ${response.status} ${response.statusText}. ${JSON.stringify(json)}`));
// 	}

// 	const result = await response.json();
// 	// Асинхронный режим
// 	if (shouldUseAsyncRecognize) {
// 		try {
// 			const yandexCloudOperation = YandexCloudOperationSchema.parse(result);

// 			existingOperation.value.status = 'running';
// 			existingOperation.value.providerData.yandexCloudOperation = yandexCloudOperation;

// 			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 			if (updatedOperation.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 			}
// 			return ok(updatedOperation.value);
// 		} catch (error) {
// 			return err(new YandexCloudOCRAPIError('Не удалось разобрать ответ YandexOCR как YandexCloudOperation', error as Error));
// 		}
// 	} else { // Синхронный режим
// 		const yandexRecognitionResult = toYandexRecognition(result);
// 		if (yandexRecognitionResult.isErr()) {
// 			return err(new YandexCloudOCRAPIError(`Не удалось разобрать ответ YandexOCR как YandexRecognitionResult`, yandexRecognitionResult.error));
// 		}
// 		const text = toString(yandexRecognitionResult.value);
// 		if (text.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось извлечь текст из результатов распознавания', text.error));
// 		}
// 		existingOperation.value.status = 'completed';
// 		existingOperation.value.result = { text: text.value };
// 		existingOperation.value.completedAt = new Date().toISOString();
// 		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 		if (updatedOperation.isOk()) {
// 			return ok(updatedOperation.value);
// 		} else {
// 			return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 		}
// 	}
// }

// /**
//  * Получает результаты распознавания через GetRecognition endpoint и обновляет операцию обработки, если она еще не завершена
//  *
//  * @param operationId - ID операции у внешнего сервиса (Yandex)
//  * @returns Операция обработки
//  */
// export async function fetchYandexRecognition(yandexCloudOperation: YandexCloudOperation):
// 	Promise<Result<YandexOCRRecognitionResult | YandexOCRRecognitionResult[], YandexCloudOCRAPIError>> {
// 	const config = aiConfig.yandexOCR;
// 	const endpoint =
// 		config.getRecognitionEndpoint ||
// 		'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition';

// 	logger.debug('Получение результатов распознавания через GetRecognition', {
// 		yandexCloudOperationId: yandexCloudOperation.id,
// 		endpoint
// 	});

// 	let response: Response;
// 	try {
// 		response = await fetchStable(
// 			`${endpoint}?operationId=${yandexCloudOperation.id}`,
// 			{
// 				method: 'GET',
// 				headers: {
// 					Authorization: `Api-Key ${config.apiKey}`,
// 					'Content-Type': 'application/json'
// 				}
// 			},
// 			30000, // timeout: 30 секунд для получения результатов
// 			2 // maxRetries: 2 попытки при сетевых ошибках
// 		);
// 		if (!response.ok) {
// 			const json = await response.json();
// 			return err(new YandexCloudOCRAPIError(`YandexOCR GetRecognition API вернул ошибку: ${response.status} ${response.statusText}. ${JSON.stringify(json)}`));
// 		}
// 	} catch (error) {
// 		return err(new YandexCloudOCRAPIError('Не удалось получить ответ от GetRecognition', error as Error));
// 	}
// 	const result = response.json();

// 	const yandexRecognitionResult = toYandexRecognition(result);
// 	if (yandexRecognitionResult.isErr()) {
// 		return err(new YandexCloudOCRAPIError('Не удалось разобрать ответ GetRecognition как YandexRecognitionResult', yandexRecognitionResult.error));
// 	}

// 	return ok(yandexRecognitionResult.value);
// }

// export async function checkYandexOCROperation(operationId: string): Promise<Result<ProcessingOperation, YandexCloudOCRAPIError>> {
// 	const config = aiConfig.yandexOCR;
// 	const existingOperation = getOperation(operationId);
// 	if (existingOperation.isErr()) {
// 		return err(new YandexCloudOCRAPIError('Операция не найдена', existingOperation.error));
// 	}
// 	// Если асинхронная операция уже существует, то проверяем её статус и если завершена, то получаем результаты через GetRecognition
// 	const yandexCloudOperation = existingOperation.value.providerData.yandexCloudOperation as YandexCloudOperation | undefined;
// 	if (yandexCloudOperation?.id) {
// 		const updatedYandexCloudOperation = await getYandexCloudOperation(yandexCloudOperation.id, config.apiKey);
// 		if (updatedYandexCloudOperation.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось получить результаты асинхронной операции', updatedYandexCloudOperation.error));
// 		}
// 		existingOperation.value.providerData.yandexCloudOperation = updatedYandexCloudOperation.value;
// 		const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 		if (updatedOperation.isErr()) {
// 			return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 		}

// 		if (updatedYandexCloudOperation.value.done) {
// 			const recognitionResult = await fetchYandexRecognition(updatedYandexCloudOperation.value);
// 			if (recognitionResult.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось получить результаты распознавания', recognitionResult.error));
// 			}
// 			const text = toString(recognitionResult.value);
// 			if (text.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось извлечь текст из результатов распознавания', text.error));
// 			}

// 			existingOperation.value.status = 'completed';
// 			existingOperation.value.result = { text: text.value };
// 			existingOperation.value.completedAt = new Date().toISOString();
// 			const updatedOperation = updateOperation(existingOperation.value.id, existingOperation.value);
// 			if (updatedOperation.isErr()) {
// 				return err(new YandexCloudOCRAPIError('Не удалось обновить операцию обработки', updatedOperation.error));
// 			}
// 		}
// 		return ok(updatedOperation.value);
// 	}
// 	return ok(existingOperation.value);
// }