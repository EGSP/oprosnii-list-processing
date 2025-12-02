import { getDatabase, rowToProcessingOperation, processingOperationToRow, type ProcessingOperationRow } from './db.js';
import {
	type ProcessingOperation,
	type ProcessingOperationType,
	type ProcessingOperationStatus,
	ProcessingOperationSchema
} from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, ValidationError, OperationAlreadyExistsError } from './errors.js';
import { updateApplication } from './repository.js';
import { logger } from '../utils/logger.js';
import { err, ok, Result } from 'neverthrow';


/**
 * Создает новую операцию обработки
 * Если операция с таким (applicationId, type) уже существует - выбрасывает ошибку
 */
export function createOperation(
	applicationId: string,
	type: ProcessingOperationType,
	provider: string,
	providerData: Record<string, unknown> = {},
	status: ProcessingOperationStatus = 'running'
): Result<ProcessingOperation, Error> {
	const db = getDatabase();

	// Проверяем, существует ли операция с таким типом для заявки
	const existing = getOperationByApplicationAndType(applicationId, type);
	if (existing) {
		return err(new OperationAlreadyExistsError(applicationId, type));
	}

	// Создаем новую операцию
	const now = new Date().toISOString();
	let operation: ProcessingOperation;
	try {
		operation = ProcessingOperationSchema.parse({
			id: uuidv4(),
			applicationId,
			type,
			provider,
			status,
			providerData,
			result: null,
			createdAt: now,
			completedAt: status === 'completed' || status === 'failed' ? now : null
		});
	} catch (error) {
		return err(new ValidationError('Invalid processing operation data', error));
	}

	const row = processingOperationToRow(operation);

	try {
		const stmt = db.prepare(`
			INSERT INTO processing_operations (
				id, application_id, type, provider, status,
				provider_data, result, created_at, completed_at
			) VALUES (
				:id, :application_id, :type, :provider, :status,
				:provider_data, :result, :created_at, :completed_at
			)
		`);
		stmt.run(row);

		return ok(operation);
	} catch (error) {
		return err(new StorageError('Failed to create operation', error as Error));
	}
}

/**
 * Получает операцию по ID
 */
export function getOperation(id: string): Result<ProcessingOperation, Error> {
	try {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM processing_operations WHERE id = ?');
		const row = stmt.get(id) as ProcessingOperationRow | undefined;

		if (!row) {
			return err(new StorageError(`Operation not found ${id}`));
		}

		return ok(rowToProcessingOperation(row));
	} catch (error) {
		return err(new StorageError('Failed to get operation', error as Error));
	}
}

/**
 * Получает операцию по applicationId и типу
 */
export function getOperationByApplicationAndType(
	applicationId: string,
	type: ProcessingOperationType
): Result<ProcessingOperation, Error> {
	try {
		const db = getDatabase();
		const stmt = db.prepare(
			'SELECT * FROM processing_operations WHERE application_id = ? AND type = ?'
		);
		const row = stmt.get(applicationId, type) as ProcessingOperationRow | undefined;

		if (!row) {
			return err(new StorageError(`Operation not found ${applicationId} ${type}`));
		}

		return ok(rowToProcessingOperation(row));
	} catch (error) {
		return err(new StorageError('Failed to get operation by application and type', error as Error));
	}
}

/**
 * Получает список id операций для заявки
 */
export function getOperationsByApplication(
	applicationId: string,
	type?: ProcessingOperationType
): Result<string[], Error> {
	try {
		const db = getDatabase();
		let query = 'SELECT id FROM processing_operations WHERE application_id = ?';
		const params: (string | ProcessingOperationType)[] = [applicationId];

		if (type) {
			query += ' AND type = ?';
			params.push(type);
		}

		query += ' ORDER BY created_at DESC';

		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as { id: string }[];

		return ok(rows.map((row) => row.id));
	} catch (error) {
		return err(new StorageError('Failed to list operations', error as Error));
	}
}

/**
 * Обновляет операцию (полная перезапись)
 * Сохраняет createdAt и applicationId из существующей операции
 */
export function updateOperation(
	id: string,
	operation: ProcessingOperation
): Result<ProcessingOperation, Error> {
	const db = getDatabase();

	// Получаем текущую операцию
	const currentOperation = getOperation(id);
	if (currentOperation.isErr()) {
		return currentOperation;
	}

	let newOperation: ProcessingOperation;
	try {
		// Сохраняем createdAt и applicationId из существующей операции
		newOperation = ProcessingOperationSchema.parse({
			...operation,
			id,
			createdAt: currentOperation.value.createdAt,
			applicationId: currentOperation.value.applicationId
		});
	} catch (error) {
		return err(new ValidationError('Invalid operation data', error));
	}

	// Валидация
	const row = processingOperationToRow(newOperation);

	try {
		const stmt = db.prepare(`
			UPDATE processing_operations SET
				type = :type,
				provider = :provider,
				status = :status,
				provider_data = :provider_data,
				result = :result,
				completed_at = :completed_at
			WHERE id = :id
		`);
		stmt.run({ ...row, id });

		return ok(newOperation);
	} catch (error) {
		return err(new StorageError('Failed to update operation', error as Error));
	}
}

/**
 * Применяет результаты операций к заявке
 * @param applicationId - ID заявки
 * @returns Result<void, Error> - Результат применения операций к заявке
 */
export function applyOperationsToApplication(applicationId: string): Result<void, Error> {
	const operations = getOperationsByApplication(applicationId);
	if (operations.isErr()) {
		return err(operations.error);
	}
	for (const id of operations.value) {
		const operation = getOperation(id);
		if (operation.isOk()) {
			const result = writeOperationResultToApplication(applicationId, operation.value);
			if (result.isErr()) {
				logger.error('Failed to write operation result to application', { applicationId, operationId: id, error: result.error });
			}
		}
	}
	return ok(undefined);
}

/**
 * Синхронизирует результат завершенной операции с таблицей applications
 * Обновляет соответствующее поле в заявке на основе типа операции
 *
 * @param operation - Операция обработки
 * @returns true если синхронизация выполнена, false если операция не завершена или не требует синхронизации
 */
function writeOperationResultToApplication(applicationId: string, operation: ProcessingOperation): Result<void, Error> {
	// Синхронизируем только завершенные операции
	if (operation.status !== 'completed' || !operation.result || 'error' in operation.result) {
		return err(new Error('Operation is not completed or has an error'));
	}

	const updates: Parameters<typeof updateApplication>[1] = {};

	switch (operation.type) {
		case 'ocr': {
			const result = operation.result as { text?: string };
			if (result?.text) {
				updates.ocrResult = { text: result.text };
			}
			break;
		}

		case 'llm_product_type': {
			const result = operation.result as { type?: string; confidence?: number; reasoning?: string };
			if (result?.type) {
				updates.llmProductTypeResult = result;
				updates.productType = result.type;
			}
			break;
		}

		case 'llm_abbreviation': {
			const result = operation.result as {
				parameters?: unknown[];
				abbreviation?: string;
				technicalSpecId?: string;
				generatedAt?: string;
			};
			if (result?.parameters || result?.abbreviation) {
				updates.llmAbbreviationResult = result;
				updates.processingEndDate = result.generatedAt || operation.completedAt || new Date().toISOString();
			}
			break;
		}

		default:
			// Неизвестный тип операции, не синхронизируем
			return err(new Error('Unknown operation type'));
	}

	// Обновляем заявку только если есть что обновлять
	if (Object.keys(updates).length > 0) {
		updateApplication(applicationId, updates);
	}

	return ok(undefined);
}

