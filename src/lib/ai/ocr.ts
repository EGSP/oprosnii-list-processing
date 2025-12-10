/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF (через yandex/ocr.ts)
 * - Извлечение текста из DOCX через mammoth (локально)
 * - Извлечение текста из XLSX через xlsx (локально)
 */

import {
	createOperation,
	findOperationsByFilter,
	getOperation,
	updateOperation
} from '../storage/processingOperations.js';
import { getRecognition, recognizeText, recognizeTextAsync, type YandexOCRMimeType, type YandexOCRRecognitionResult } from './yandex/api-ocr.js';
import type { ProcessingOperation } from '../business/types.js';
import { ok, Result, err, errAsync, ResultAsync, okAsync } from 'neverthrow';
import { readApplicationFile, type FileInfo } from '$lib/storage/files.js';
import { aiConfig } from './config.js';
import type { YandexCloudOperation } from './yandex/api.js';

export class OCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'OCRError';
	}
}

export function getOCRData(processingOperation: ProcessingOperation): Result<string, Error> {
	if (processingOperation.status !== 'completed')
		return err(new OCRError('Операция не завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return err(new OCRError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return getYandexOCRData(processingOperation.data as { service: string;[key: string]: unknown });
		default:
			return err(new OCRError('Неизвестный сервис'));
	}
}

/**
 * Получает данные из операции OCR Yandex
 * @param data - Данные операции
 * @returns Результат с текстом или ошибкой
 */
function getYandexOCRData(data: { service: string;[key: string]: unknown }): Result<string, Error> {
	if (!data.service || data.service !== 'yandex')
		return err(new OCRError('Неверный сервис'));

	const recognitionResult = data.recognitionResult as YandexOCRRecognitionResult;
	if (!recognitionResult)
		return err(new OCRError('Не указан результат распознавания'));

	if (Array.isArray(recognitionResult)) {
		const text = recognitionResult.map((item) => item.textAnnotation?.fullText).join('\n');
		return ok(text)
	} else {
		const text = recognitionResult.textAnnotation.fullText as string;
		return ok(text);
	}
}

export function fetchOCRData(processingOperation: ProcessingOperation): ResultAsync<void, Error> {
	if (processingOperation.status !== 'started')
		return errAsync(new OCRError('Операция уже завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return errAsync(new OCRError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return fetchYandexOCRData(processingOperation.data as { service: string;[key: string]: unknown })
				.andThen((recognitionResult) => {
					processingOperation.data.recognitionResult = recognitionResult;
					return updateOperation(processingOperation.id, {
						data: { ...processingOperation.data, recognitionResult },
						status: 'completed'
					});
				}).map(() => undefined);
		default:
			return errAsync(new OCRError('Неизвестный сервис'));
	}
}

function fetchYandexOCRData(data: { service: string;[key: string]: unknown }):
	ResultAsync<YandexOCRRecognitionResult, Error> {
	if (!data.service || data.service !== 'yandex')
		return errAsync(new OCRError('Неверный сервис'));

	const cloudOperation = data.cloudOperation as YandexCloudOperation;
	if (!cloudOperation)
		return errAsync(new OCRError('Не указан cloudOperation'));

	return getRecognition(aiConfig.yandexOCR.apiKey, cloudOperation);
}

export function extractText(applicationId: string, fileInfo: FileInfo): ResultAsync<ProcessingOperation, Error> {
	const config = aiConfig.yandexOCR;
	if (fileInfo.type !== 'pdf' && fileInfo.type !== 'image')
		return errAsync(new OCRError('Не поддерживаемый тип файла'));


	return readApplicationFile(applicationId).asyncAndThen((fileBuffer) => {
		let yandexMimeType: YandexOCRMimeType;
		switch (fileInfo.extension) {
			case 'pdf':
				yandexMimeType = 'application/pdf';
				break;
			case 'jpg':
			case 'jpeg':
				yandexMimeType = 'image/jpeg';
				break;
			case 'png':
				yandexMimeType = 'image/png';
				break;
			default:
				return errAsync(new OCRError('Не поддерживаемый тип файла'));
		}

		const needAsyncRecognition = fileInfo.pageCount > 1 && fileInfo.extension === 'pdf';

		return createOperation(applicationId, 'extractText')
			.asyncAndThen((processingOperation) => {
				if (needAsyncRecognition) {
					return ResultAsync.fromSafePromise(
						recognizeTextAsync(config.apiKey, fileBuffer, yandexMimeType, 'page'))
						.andThen((cloudOperation) => {
							processingOperation.data.service = 'yandex';
							processingOperation.data.cloudOperation = cloudOperation;
							return updateOperation(processingOperation.id, {
								data: processingOperation.data
							});
						});
				} else {
					return ResultAsync.fromSafePromise(
						recognizeText(config.apiKey, fileBuffer, yandexMimeType))
						.andThen((recognitionResult) => {
							processingOperation.status = 'completed';
							processingOperation.data.service = 'yandex';
							processingOperation.data.recognitionResult = recognitionResult;
							return updateOperation(processingOperation.id, {
								data: processingOperation.data,
								status: 'completed'
							});
						});
				}
			});
	});
}

/**
 * Получает все не завершенные операции OCR и пытается получить результаты по ним
 * @param processingOperation - Операция OCR
 * @returns Результат с ошибкой или undefined
 */
export function fetchOCROperation(processingOperation: ProcessingOperation): ResultAsync<void, Error> {
	return getOperation(processingOperation.id).asyncAndThen(fetchOCRData);
}