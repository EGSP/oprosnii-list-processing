/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF (через yandex/ocr.ts)
 * - Извлечение текста из DOCX через mammoth (локально)
 * - Извлечение текста из XLSX через xlsx (локально)
 */


import { getRecognition, recognizeText, recognizeTextAsync, type YandexOCRMimeType, type YandexOCRRecognitionResult } from './yandex/api-ocr.js';
import type { ProcessingOperation } from '../business/types.js';
import { readApplicationFile, type FileInfo } from '$lib/storage/files.js';
import { aiConfig } from './config.js';
import type { YandexCloudOperation } from './yandex/api.js';
import { Effect, pipe } from 'effect';

export class OCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'OCRError';
	}
}

/**
 * Получает данные из операции OCR Yandex
 * @param data - Данные операции
 * @returns Результат с текстом или ошибкой
 */
function getYandexOCRData(data: { service: string;[key: string]: unknown }): Effect.Effect<string, Error> {
	if (!data.service || data.service !== 'yandex')
		return Effect.fail(new OCRError('Неверный сервис'));

	const recognitionResult = data.recognitionResult as YandexOCRRecognitionResult;
	if (!recognitionResult)
		return Effect.fail(new OCRError('Не указан результат распознавания'));

	if (Array.isArray(recognitionResult)) {
		const text = recognitionResult.map((item) => item.textAnnotation?.fullText).join('\n');
		return Effect.succeed(text)
	} else {
		const text = recognitionResult.textAnnotation.fullText as string;
		return Effect.succeed(text);
	}

}

/**
 * Получает данные из операции OCR
 * @param processingOperation - Операция OCR
 * @returns Результат с текстом или ошибкой
 */
export function getOCRData(processingOperation: ProcessingOperation): Effect.Effect<string, Error> {
	if (processingOperation.status !== 'completed')
		return Effect.fail(new OCRError('Операция не завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return Effect.fail(new OCRError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return getYandexOCRData(processingOperation.data as { service: string;[key: string]: unknown });
		default:
			return Effect.fail(new OCRError('Неизвестный сервис'));
	}
}


function fetchYandexOCRData(data: { service: string;[key: string]: unknown }):
	Effect.Effect<YandexOCRRecognitionResult, Error> {
	if (!data.service || data.service !== 'yandex')
		return Effect.fail(new OCRError('Неверный сервис'));

	const cloudOperation = data.cloudOperation as YandexCloudOperation;
	if (!cloudOperation)
		return Effect.fail(new OCRError('Не указан cloudOperation'));

	return getRecognition(aiConfig.yandexOCR.apiKey, cloudOperation);
}

export function fetchOCRData(processingOperation: ProcessingOperation): Effect.Effect<void, Error> {
	if (processingOperation.status !== 'started')
		return Effect.fail(new OCRError('Операция уже завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return Effect.fail(new OCRError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return pipe(
				fetchYandexOCRData(processingOperation.data as { service: string;[key: string]: unknown }),
				Effect.tap((recognitionResult) => {
					return updateOperation(processingOperation.id, {
						data: { ...processingOperation.data, recognitionResult },
						status: 'completed'
					})
				})
			)
		default:
			return Effect.fail(new OCRError('Неизвестный сервис'));
	}
}

export function extractText(applicationId: string, fileInfo: FileInfo): Effect.Effect<ProcessingOperation, Error> {
	const config = aiConfig.yandexOCR;
	if (fileInfo.type !== 'pdf' && fileInfo.type !== 'image')
		return Effect.fail(new OCRError('Не поддерживаемый тип файла'));

	return Effect.gen(function* () {
		const fileBuffer = yield* readApplicationFile(applicationId);
		let yandexMimeType: YandexOCRMimeType;
		switch (fileInfo.extension) {
			case 'pdf':
				yandexMimeType = 'application/pdf';
				break;
			case 'jpg':
				yandexMimeType = 'image/jpeg';
				break;
			case 'png':
				yandexMimeType = 'image/png';
				break;
			default:
				return yield* Effect.fail(new OCRError('Не поддерживаемый тип файла'));
		}

		const needAsyncRecognition = fileInfo.pageCount > 1 && fileInfo.extension === 'pdf';

		const processingOperation = yield* createOperation(applicationId, 'extractText');
		processingOperation.data.service = 'yandex';

		if (needAsyncRecognition) {
			const cloudOperation = yield* recognizeTextAsync(config.apiKey, fileBuffer, yandexMimeType, 'page');

			processingOperation.data.cloudOperation = cloudOperation;
			return yield* updateOperation(processingOperation.id, {
				data: processingOperation.data
			});
		}
		else {
			const recognitionResult = yield* recognizeText(config.apiKey, fileBuffer, yandexMimeType);

			processingOperation.data.recognitionResult = recognitionResult;
			return yield* updateOperation(processingOperation.id, {
				...processingOperation,
				status: 'completed',
				data: processingOperation.data
			});
		}
	});
}