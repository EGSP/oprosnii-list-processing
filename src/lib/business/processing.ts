/**
 * Бизнес-логика обработки заявок
 *
 * Функции для определения типа изделия и формирования аббревиатуры
 * с использованием OCR и LLM сервисов.
 */

import {
	extractText
} from '../ai/index.js';
import {
	getFileInfo,
	findOperations,
	createOperation,
	getApplication,
	getOperation,
	findOperationsByFilter,
	updateOperation,
	getOperationsByFilter
} from '../storage/index.js';
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import { extractTextFromApplicationFile } from '$lib/utils/content.js';
import { resolveProductType } from '$lib/ai/llm.js';
import { fetchOCRData, getOCRData } from '$lib/ai/ocr.js';

export class ProcessingError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'ProcessingError';
	}
}

/**
 * Извлекает текст из файла заявки
 *
 * @param applicationId - GUID заявки
 * @returns Результат извлечения текста с операцией
 */
export function processTextExtraction(applicationId: string): ResultAsync<void, Error> {
	return findOperations(applicationId, 'extractText')
		.asyncAndThen((operations) => {
			if (operations.length > 0)
				return errAsync(new ProcessingError('Уже есть операция извлечения текста'));
			return okAsync(undefined);
		})
		.andThen((undef) => {
			return getFileInfo(applicationId);
		})
		.andThen(fileInfo => {
			if (fileInfo.type === 'pdf' || fileInfo.type === 'image') {
				// Если извлекаем через OCR, то processing operation создается внутри функции extractText
				return extractText(applicationId, fileInfo);
			} else {
				return extractTextFromApplicationFile(applicationId, fileInfo).andThen((extractedText) =>
					createOperation(applicationId, 'extractText', { result: extractedText }, 'completed'));
			}
		})
		.map(() => undefined);
}

/**
 * Получает все не завершенные операции извлечения текста и пытается получить результаты по ним
 * @param applicationId - ID заявки
 * @returns Результат с ошибкой или undefined
 */
export function fetchTextExtraction(applicationId: string): ResultAsync<void, Error> {
	return getOperationsByFilter(applicationId, { task: 'extractText', status: 'started' })
		.asyncAndThen((operations) => {
			return ResultAsync.fromSafePromise(Promise.allSettled(operations.map((operation) => fetchOCRData(operation))));
		}).map(() => undefined);
}

export function processProductTypeResolve(applicationId: string): ResultAsync<void, Error> {
	return getApplication(applicationId).asyncAndThen((application) => {
		if (application.productType)
			return okAsync(undefined);

		return findOperations(applicationId, 'resolveProductType').asyncAndThen((operationsId) => {
			if (operationsId.length > 0)
				return okAsync(undefined);

			// Create fresh operation
			return findExtractedText(applicationId).asyncAndThen((text) =>
				createOperation(applicationId, 'resolveProductType')
					.asyncAndThen(processingOperation => resolveProductType(applicationId, text)
						.andThen(productType => updateOperation(processingOperation.id, {
							status: 'completed', data: {
								...processingOperation.data,
								productType: productType
							}
						})
						).map(() => undefined))
			);
		});
	});
}


function findExtractedText(applicationId: string): Result<string, Error> {
	return findOperationsByFilter(applicationId, { task: 'extractText', status: 'completed' }).andThen((operationIds) => {
		if (operationIds.length === 0)
			return err(new ProcessingError('Не найден результат извлечения текста'));

		const text = operationIds.map((operationId) => {
			return getOperation(operationId).andThen((operation) => {
				if (operation.data.service) {
					return getOCRData(operation);
				} else {
					return ok(operation.data.result as string);
				}
			});
		}).join('\n');
		return ok(text);
	});
}