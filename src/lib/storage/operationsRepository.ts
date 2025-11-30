import { getDatabase, rowToProcessingOperation, processingOperationToRow, type ProcessingOperationRow } from './db.js';
import {
	type ProcessingOperation,
	type ProcessingOperationUpdate,
	type ProcessingOperationType,
	type ProcessingOperationStatus,
	ProcessingOperationSchema
} from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, ValidationError } from './errors.js';
import { updateApplication } from './repository.js';
import { logger } from '../utils/logger.js';

/**
 * Создает новую операцию обработки или обновляет существующую
 * Если операция с таким (applicationId, type) уже существует - обновляет её
 */
export function createOrUpdateOperation(
	applicationId: string,
	type: ProcessingOperationType,
	provider: string,
	requestData: ProcessingOperation['requestData'],
	status: ProcessingOperationStatus = 'pending',
	externalOperationId?: string | null
): ProcessingOperation {
	const db = getDatabase();

	// Проверяем, существует ли операция с таким типом для заявки
	const existing = getOperationByApplicationAndType(applicationId, type);

	let operation: ProcessingOperation;

	if (existing) {
		// Обновляем существующую операцию
		const now = new Date().toISOString();
		operation = {
			...existing,
			provider,
			status,
			externalOperationId: externalOperationId ?? null,
			requestData,
			// Сбрасываем результат и ошибку при обновлении
			result: null,
			error: null,
			startedAt: status === 'running' || status === 'completed' ? now : null,
			completedAt: status === 'completed' || status === 'failed' ? now : null,
			retryCount: (existing.retryCount ?? 0) + 1
		};
	} else {
		// Создаем новую операцию
		const now = new Date().toISOString();
		operation = {
			id: uuidv4(),
			applicationId,
			type,
			provider,
			status,
			externalOperationId: externalOperationId ?? null,
			requestData,
			result: null,
			error: null,
			createdAt: now,
			startedAt: status === 'running' || status === 'completed' ? now : null,
			completedAt: status === 'completed' || status === 'failed' ? now : null,
			progress: null,
			retryCount: 0,
			maxRetries: 3
		};
	}

	// Валидация через Zod
	let validated: ProcessingOperation;
	try {
		validated = ProcessingOperationSchema.parse(operation);
	} catch (error) {
		throw new ValidationError('Invalid processing operation data', error);
	}

	const row = processingOperationToRow(validated);

	try {
		if (existing) {
			// Обновляем существующую
			const stmt = db.prepare(`
				UPDATE processing_operations SET
					provider = :provider,
					status = :status,
					external_operation_id = :external_operation_id,
					request_data = :request_data,
					result = :result,
					error = :error,
					started_at = :started_at,
					completed_at = :completed_at,
					progress = :progress,
					retry_count = :retry_count,
					max_retries = :max_retries
				WHERE id = :id
			`);
			stmt.run({ ...row, id: existing.id });
			return { ...validated, id: existing.id };
		} else {
			// Создаем новую
			const stmt = db.prepare(`
				INSERT INTO processing_operations (
					id, application_id, type, provider, status,
					external_operation_id, request_data, result, error,
					created_at, started_at, completed_at, progress,
					retry_count, max_retries
				) VALUES (
					:id, :application_id, :type, :provider, :status,
					:external_operation_id, :request_data, :result, :error,
					:created_at, :started_at, :completed_at, :progress,
					:retry_count, :max_retries
				)
			`);
			stmt.run(row);
			return validated;
		}
	} catch (error) {
		throw new StorageError('Failed to create or update operation', error as Error);
	}
}

/**
 * Получает операцию по ID
 */
export function getOperation(id: string): ProcessingOperation | null {
	try {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM processing_operations WHERE id = ?');
		const row = stmt.get(id) as ProcessingOperationRow | undefined;

		if (!row) {
			return null;
		}

		return rowToProcessingOperation(row);
	} catch (error) {
		throw new StorageError('Failed to get operation', error as Error);
	}
}

/**
 * Получает операцию по applicationId и типу
 */
export function getOperationByApplicationAndType(
	applicationId: string,
	type: ProcessingOperationType
): ProcessingOperation | null {
	try {
		const db = getDatabase();
		const stmt = db.prepare(
			'SELECT * FROM processing_operations WHERE application_id = ? AND type = ?'
		);
		const row = stmt.get(applicationId, type) as ProcessingOperationRow | undefined;

		if (!row) {
			return null;
		}

		return rowToProcessingOperation(row);
	} catch (error) {
		throw new StorageError('Failed to get operation by application and type', error as Error);
	}
}

/**
 * Получает список операций для заявки
 */
export function getOperationsByApplication(
	applicationId: string,
	type?: ProcessingOperationType
): ProcessingOperation[] {
	try {
		const db = getDatabase();
		let query = 'SELECT * FROM processing_operations WHERE application_id = ?';
		const params: (string | ProcessingOperationType)[] = [applicationId];

		if (type) {
			query += ' AND type = ?';
			params.push(type);
		}

		query += ' ORDER BY created_at DESC';

		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as ProcessingOperationRow[];

		return rows.map(rowToProcessingOperation);
	} catch (error) {
		throw new StorageError('Failed to list operations', error as Error);
	}
}

/**
 * Обновляет операцию
 */
export function updateOperation(
	id: string,
	updates: ProcessingOperationUpdate
): ProcessingOperation | null {
	const db = getDatabase();

	// Получаем текущую операцию
	const current = getOperation(id);
	if (!current) {
		return null;
	}

	// Объединяем обновления с текущими данными
	const updated = { ...current, ...updates };

	// Автоматически обновляем временные метки при изменении статуса
	if (updates.status) {
		const now = new Date().toISOString();
		if (updates.status === 'running' && !updated.startedAt) {
			updated.startedAt = now;
		}
		if ((updates.status === 'completed' || updates.status === 'failed') && !updated.completedAt) {
			updated.completedAt = now;
		}
	}

	// Валидация
	let validated: ProcessingOperation;
	try {
		validated = ProcessingOperationSchema.parse(updated);
	} catch (error) {
		throw new ValidationError('Invalid operation update data', error);
	}

	const row = processingOperationToRow(validated);

	try {
		const stmt = db.prepare(`
			UPDATE processing_operations SET
				status = :status,
				external_operation_id = :external_operation_id,
				result = :result,
				error = :error,
				started_at = :started_at,
				completed_at = :completed_at,
				progress = :progress,
				retry_count = :retry_count,
				max_retries = :max_retries
			WHERE id = :id
		`);
		stmt.run({ ...row, id });

		return validated;
	} catch (error) {
		throw new StorageError('Failed to update operation', error as Error);
	}
}

/**
 * Обновляет статус операции с автоматическим заполнением временных меток
 */
export function updateOperationStatus(
	id: string,
	status: ProcessingOperationStatus,
	data?: {
		result?: Record<string, unknown>;
		error?: { message: string; code?: string; details?: unknown };
		externalOperationId?: string | null;
		progress?: { current: number; total: number; message?: string };
	}
): ProcessingOperation | null {
	const updates: ProcessingOperationUpdate = {
		status
	};

	if (data?.result !== undefined) {
		updates.result = data.result;
	}
	if (data?.error !== undefined) {
		updates.error = data.error;
	}
	if (data?.externalOperationId !== undefined) {
		updates.externalOperationId = data.externalOperationId;
	}
	if (data?.progress !== undefined) {
		updates.progress = data.progress;
	}

	return updateOperation(id, updates);
}

/**
 * Синхронизирует результат завершенной операции с таблицей applications
 * Обновляет соответствующее поле в заявке на основе типа операции
 *
 * @param operation - Операция обработки
 * @returns true если синхронизация выполнена, false если операция не завершена или не требует синхронизации
 */
export function syncOperationToApplication(operation: ProcessingOperation): boolean {
	// Синхронизируем только завершенные операции
	if (operation.status !== 'completed' || !operation.result) {
		return false;
	}

	try {
		const applicationId = operation.applicationId;
		const updates: Parameters<typeof updateApplication>[1] = {};

		switch (operation.type) {
			case 'ocr': {
				// Обновляем ocrResult
				const result = operation.result as { text?: string };
				if (result.text) {
					updates.ocrResult = { text: result.text };
					logger.debug('Синхронизация OCR результата с заявкой', {
						applicationId,
						operationId: operation.id
					});
				}
				break;
			}

			case 'llm_product_type': {
				// Обновляем llmProductTypeResult и productType
				const result = operation.result as { type?: string; confidence?: number; reasoning?: string };
				if (result.type) {
					updates.llmProductTypeResult = result;
					updates.productType = result.type;
					logger.debug('Синхронизация результата определения типа изделия с заявкой', {
						applicationId,
						operationId: operation.id,
						productType: result.type
					});
				}
				break;
			}

			case 'llm_abbreviation': {
				// Обновляем llmAbbreviationResult и processingEndDate
				const result = operation.result as {
					parameters?: unknown[];
					abbreviation?: string;
					technicalSpecId?: string;
					generatedAt?: string;
				};
				if (result.parameters || result.abbreviation) {
					updates.llmAbbreviationResult = result;
					updates.processingEndDate = result.generatedAt || operation.completedAt || new Date().toISOString();
					logger.debug('Синхронизация результата формирования аббревиатуры с заявкой', {
						applicationId,
						operationId: operation.id,
						abbreviation: result.abbreviation
					});
				}
				break;
			}

			default:
				// Неизвестный тип операции, не синхронизируем
				return false;
		}

		// Обновляем заявку только если есть что обновлять
		if (Object.keys(updates).length > 0) {
			updateApplication(applicationId, updates);
			return true;
		}

		return false;
	} catch (error) {
		logger.error('Ошибка при синхронизации операции с заявкой', {
			operationId: operation.id,
			applicationId: operation.applicationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		// Не пробрасываем ошибку, чтобы не ломать основной поток
		return false;
	}
}

/**
 * Получает операцию по ID с автоматической синхронизацией результата с заявкой
 */
export function getOperationWithSync(id: string): ProcessingOperation | null {
	const operation = getOperation(id);
	if (operation) {
		syncOperationToApplication(operation);
	}
	return operation;
}

/**
 * Получает операцию по applicationId и типу с автоматической синхронизацией результата с заявкой
 */
export function getOperationByApplicationAndTypeWithSync(
	applicationId: string,
	type: ProcessingOperationType
): ProcessingOperation | null {
	const operation = getOperationByApplicationAndType(applicationId, type);
	if (operation) {
		syncOperationToApplication(operation);
	}
	return operation;
}

/**
 * Получает список операций для заявки с автоматической синхронизацией результатов с заявкой
 */
export function getOperationsByApplicationWithSync(
	applicationId: string,
	type?: ProcessingOperationType
): ProcessingOperation[] {
	const operations = getOperationsByApplication(applicationId, type);
	// Синхронизируем каждую завершенную операцию
	for (const operation of operations) {
		if (operation.status === 'completed') {
			syncOperationToApplication(operation);
		}
	}
	return operations;
}
