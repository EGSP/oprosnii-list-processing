/**
 * Бизнес-логика обработки заявок
 *
 * Функции для определения типа изделия и формирования аббревиатуры
 * с использованием OCR и LLM сервисов.
 */

import {
	extractText} from '../ai/index.js';
import {
	getFileInfo,
	findOperations,
	createOperation,
	getApplication,
	updateApplication,
	getOperation
} from '../storage/index.js';
import { err, ok, Result } from 'neverthrow';
import { extractTextFromApplicationFile } from '$lib/utils/content.js';

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
export async function processTextExtraction(applicationId: string): Promise<Result<void, Error>> {
	const fileInfoResult = await getFileInfo(applicationId);
	if (fileInfoResult.isErr()) {
		return err(fileInfoResult.error);
	}
	const fileInfo = fileInfoResult.value;

	const operationsResult = findOperations(applicationId, 'extractText');
	if (operationsResult.isErr())
		return err(operationsResult.error);

	const operations = operationsResult.value;
	// Если уже есть операция извлечения текста, то ничего не делаем
	if(operations.length > 0)
		return ok(undefined);

	// Извлекаем текст из файла через OCR
	if(fileInfo.type === 'pdf' || fileInfo.type === 'image'){
		const extractOperationResult = await extractText(applicationId, fileInfo);
		if (extractOperationResult.isErr())
			return err(extractOperationResult.error);
		return ok(undefined);
	}

	// Извлекаем текст из файла из Документов или Таблиц
	const extractTextFromApplicationFileResult = await extractTextFromApplicationFile(applicationId, fileInfo);
	if (extractTextFromApplicationFileResult.isErr())
		return err(extractTextFromApplicationFileResult.error);
	const extractedText = extractTextFromApplicationFileResult.value;

	// Создаем операцию извлечения текста с указанием результата
	const processingOperationResult = createOperation(applicationId,'extractText',{result: extractedText},'completed');
	if (processingOperationResult.isErr())
		return err(processingOperationResult.error);
	return ok(undefined);
}

export async function processProductTypeResolve(applicationId: string): Promise<Result<void, Error>> {
	const applicationResult = await getApplication(applicationId);
	if (applicationResult.isErr())
		return err(applicationResult.error);
	const application = applicationResult.value;

	if(application.productType)
		return ok(undefined);

	const operationsResult = findOperations(applicationId, 'resolveProductType');
	if (operationsResult.isErr())
		return err(operationsResult.error);

	const operationsId = operationsResult.value;

	if(operationsId.length > 0){
		const operationId = operationsId[0];
		const operationResult = getOperation(operationId);
		if (operationResult.isErr())
			return err(operationResult.error);
		const operation = operationResult.value;
		const applicationUpdateResult = updateApplication(applicationId, {productType: operation.data.})
	}
}
