/**
 * Бизнес-логика обработки заявок
 *
 * Функции для определения типа изделия и формирования аббревиатуры
 * с использованием OCR и LLM сервисов.
 */

import {
	extractText
} from '$lib/ai/ocr.js';
import {
	getFileInfo,
	findOperations,
	createOperation,
	getApplication,
	getOperation,
	findOperationsByFilter,
	updateOperation,
	getOperationsByFilter,
	deleteOperations,
	type Application
} from '../storage/index.js';
import { Effect } from 'effect';
import { extractTextFromApplicationFile } from '$lib/utils/content.js';
import { fetchLLMOperation, resolveProductType } from '$lib/ai/llm.js';
import { fetchOCRData, getOCRData } from '$lib/ai/ocr.js';
import { logger } from '$lib/utils/logger.js';

/**
 * Извлекает текст из файла заявки
 *
 * @param applicationId - GUID заявки
 * @returns Effect с результатом извлечения текста
 */
export function processTextExtraction(applicationId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const operations = yield* findOperations(applicationId, 'extractText');
		if (operations.length > 0) {
			return yield* Effect.fail(new Error('Уже есть операция извлечения текста'));
		}

		const fileInfo = yield* getFileInfo(applicationId);

		if (fileInfo.type === 'pdf' || fileInfo.type === 'image') {
			// Если извлекаем через OCR, то processing operation создается внутри функции extractText
			yield* extractText(applicationId, fileInfo);
		} else {
			const extractedText = yield* extractTextFromApplicationFile(applicationId, fileInfo);
			yield* createOperation(applicationId, 'extractText', { result: extractedText }, 'completed');
		}
	});
}

/**
 * Получает все не завершенные операции извлечения текста и пытается получить результаты по ним
 * @param applicationId - ID заявки
 * @returns Effect с результатом обработки
 */
export function fetchTextExtraction(applicationId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const operations = yield* getOperationsByFilter(applicationId, { task: 'extractText', status: 'started' });
		yield* Effect.all(
			operations.map((operation) => fetchOCRData(operation))
		);
	});
}


/**
 * Получает извлеченный текст из заявки
 * @param applicationId - ID заявки
 * @returns Effect с извлеченным текстом
 */
export function getExtractedText(applicationId: string): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const operationIds = yield* findOperationsByFilter(applicationId, { task: 'extractText', status: 'completed' });
		if (operationIds.length === 0) {
			return yield* Effect.fail(new Error('Не найден результат извлечения текста'));
		}

		const texts = yield* Effect.all(
			operationIds.map((operationId) =>
				Effect.gen(function* () {
					const operation = yield* getOperation(operationId);
					if (operation.data.service) {
						return yield* getOCRData(operation);
					} else {
						return operation.data.result as string;
					}
				})
			)
		);

		return texts.filter((text) => text).join('\n');
	});
}

export function processProductTypeResolve(application: Application): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		if (application.productType) {
			return;
		}

		const operationsId = yield* findOperations(application.id, 'resolveProductType');
		if (operationsId.length > 0) {
			logger.info(`Удаляем операции перед определением типа изделия ${operationsId.join(', ')}`);
			yield* deleteOperations(operationsId);
		}

		// Create fresh operation
		const text = yield* getExtractedText(application.id);
		if (!text || text.length === 0) 
			return yield* Effect.fail(new Error('Текст извлеченный из базы данных заявки - пустой.'));

		const processingOperation = yield* createOperation(application.id, 'resolveProductType');
		const productType = yield* resolveProductType(text);

		yield* updateOperation(processingOperation.id, {
			status: 'completed',
			data: {
				...processingOperation.data,
				service: 'yandex',
				productType: productType
			}
		});
	});
}

export function fetchProductTypeResolve(applicationId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const application = yield* getApplication(applicationId);
		if (application.productType) {
			return;
		}

		const operationsId = yield* findOperations(applicationId, 'resolveProductType');
		if (operationsId.length > 0) {
			yield* Effect.all(
				operationsId.map((operationId) =>
					Effect.gen(function* () {
						const operation = yield* getOperation(operationId);
						yield* fetchLLMOperation(operation);
					})
				)
			);
		}
	});
}

function fetchAbbreviationResolve(applicationId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const application = yield* getApplication(applicationId);
		if (application.abbreviation) {
			return;
		}

		const operationsId = yield* findOperations(applicationId, 'resolveAbbreviation');
		if (operationsId.length > 0) {
			yield* Effect.all(
				operationsId.map((operationId) =>
					Effect.gen(function* () {
						const operation = yield* getOperation(operationId);
						yield* fetchLLMOperation(operation);
					})
				)
			);
		}
	});
}

export function fetchApplication(applicationId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		yield* getApplication(applicationId);
		yield* fetchTextExtraction(applicationId);
		yield* fetchProductTypeResolve(applicationId);
		yield* fetchAbbreviationResolve(applicationId);
	});
}

