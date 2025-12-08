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
import { ok, Result, err } from 'neverthrow';
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
			return getYandexOCRData(processingOperation.data as { service: string;[key: string]: any });
		default:
			return err(new OCRError('Неизвестный сервис'));
	}
}

/**
 * Получает данные из операции OCR Yandex
 * @param data - Данные операции
 * @returns Результат с текстом или ошибкой
 */
function getYandexOCRData(data: { service: string;[key: string]: any }): Result<string, Error> {
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

export async function extractText(applicationId: string, fileInfo: FileInfo): Promise<Result<ProcessingOperation, Error>> {
	const config = aiConfig.yandexOCR;
	if (fileInfo.type !== 'pdf' && fileInfo.type !== 'image')
		return err(new OCRError('Не поддерживаемый тип файла'));

	const fileBufferResult = readApplicationFile(applicationId);
	if (fileBufferResult.isErr())
		return err(fileBufferResult.error);
	const fileBuffer = fileBufferResult.value;

	const fileExtension = fileInfo.extension;

	let yandexMimeType: YandexOCRMimeType;
	switch (fileExtension) {
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
			return err(new OCRError('Не поддерживаемый тип файла'));
	}

	const processingOperationResult = createOperation(applicationId, 'extractText');
	if (processingOperationResult.isErr())
		return err(processingOperationResult.error);
	const processingOperation = processingOperationResult.value;

	const needAsyncRecognition = fileInfo.pageCount > 1 && fileExtension === 'pdf';
	if (needAsyncRecognition) {
		const cloudOperationResult = await recognizeTextAsync(config.apiKey, fileBuffer, yandexMimeType, 'page')
		if (cloudOperationResult.isErr())
			return err(cloudOperationResult.error);
		const cloudOperation = cloudOperationResult.value;

		processingOperation.data.service = 'yandex';
		processingOperation.data.cloudOperation = cloudOperation;
		const updateOperationResult = updateOperation(processingOperation.id, {
			data: processingOperation.data
		})

		if (updateOperationResult.isErr())
			return err(updateOperationResult.error);
		return ok(updateOperationResult.value);
	} else {
		const recognitionResultResult = await recognizeText(config.apiKey, fileBuffer, yandexMimeType)
		if (recognitionResultResult.isErr())
			return err(recognitionResultResult.error);
		const recognitionResult = recognitionResultResult.value;

		processingOperation.status = 'completed';
		processingOperation.data.service = 'yandex';
		processingOperation.data.recognitionResult = recognitionResult;
		const updateOperationResult = updateOperation(processingOperation.id, {
			data: processingOperation.data,
			status: 'completed'
		})
		
		if (updateOperationResult.isErr())
			return err(updateOperationResult.error);
		return ok(updateOperationResult.value);
	}
}