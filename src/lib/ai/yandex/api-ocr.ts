/**
 * Модуль Yandex OCR
 *
 * Функции для работы с Yandex OCR API:
 * - Распознавание текста из изображений и PDF
 * - Проверка статуса асинхронных операций
 * - Получение результатов распознавания
 */

import { fetchStable } from '../../utils/fetchStable.js';

import { z } from 'zod';
import { type YandexCloudOperation, YandexCloudOperationSchema } from './api.js';
import { Effect, pipe } from 'effect';
import { parseZodSchema, responseToZodSchema } from '$lib/utils/zod.js';

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
): Effect.Effect<YandexOCRRequestBody, Error> {
	const base64Content = fileBuffer.toString('base64');

	const result = YandexOCRRequestBodySchema.safeParse({
		content: base64Content,
		mimeType,
		languageCodes: ['ru', 'en'],
		model: model ? model : YandexOCRModelEnum.options[0]
	});
	if (result.success) {
		return Effect.succeed(result.data as YandexOCRRequestBody);
	} else {
		return Effect.fail(new YandexCloudOCRAPIError(`Не удалось создать тело запроса для Yandex OCR API: ${result.error}`));
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
export function recognizeText(
	apiKey: string,
	fileBuffer: Buffer,
	mimeType: YandexOCRMimeType,
	model?: YandexOCRModel
): Effect.Effect<YandexOCRRecognitionResult, Error> {
	return pipe(
		createYandexOCRRequestBody(fileBuffer, mimeType, model),
		Effect.flatMap((requestBody) => fetchStable(
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
		)),
		Effect.flatMap((response) => responseToZodSchema(response, YandexOCRRecognitionResultSchema)));
}

export function recognizeTextAsync(
	apiKey: string,
	fileBuffer: Buffer,
	mimeType: YandexOCRMimeType,
	model?: YandexOCRModel
): Effect.Effect<YandexCloudOperation, Error> {
	return pipe(
		createYandexOCRRequestBody(fileBuffer, mimeType, model),
		Effect.flatMap((requestBody) => fetchStable(
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
		)),
		Effect.flatMap((response) => responseToZodSchema(response, YandexCloudOperationSchema)));
}

export function getRecognition(apiKey: string, operation: YandexCloudOperation):
	Effect.Effect<YandexOCRRecognitionResult, Error> {
	return pipe(
		fetchStable(
			`${GET_RECOGNITION_ENDPOINT}?operationId=${operation.id}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Api-Key ${apiKey}`
				}
			},
			60000, // timeout: 60 секунд для OCR запросов
			2 // maxRetries: 2 попытки при сетевых ошибках
		),
		Effect.flatMap((response) => responseToZodSchema(response, YandexOCRRecognitionResultSchema)));
}