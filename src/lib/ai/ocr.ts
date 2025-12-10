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
	updateOperation
} from '../storage/processingOperations.js';
import { recognizeText, recognizeTextAsync, type YandexOCRMimeType, type YandexOCRRecognitionResult } from './yandex/api-ocr.js';
import type { ProcessingOperation } from '../business/types.js';
import { ok, Result, err, errAsync, ResultAsync, okAsync } from 'neverthrow';
import { readApplicationFile, type FileInfo } from '$lib/storage/files.js';
import { aiConfig } from './config.js';

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