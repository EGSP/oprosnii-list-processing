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
): ProcessingOperation {
	const db = getDatabase();

	// Проверяем, существует ли операция с таким типом для заявки
	const existing = getOperationByApplicationAndType(applicationId, type);
	if (existing) {
		throw new OperationAlreadyExistsError(applicationId, type);
	}

	// Создаем новую операцию
	const now = new Date().toISOString();
	const operation: ProcessingOperation = {
		id: uuidv4(),
		applicationId,
		type,
		provider,
		status,
		providerData,
		result: null,
		createdAt: now,
		completedAt: status === 'completed' || status === 'failed' ? now : null
	};

	// Валидация через Zod
	let validated: ProcessingOperation;
	try {
		validated = ProcessingOperationSchema.parse(operation);
	} catch (error) {
		throw new ValidationError('Invalid processing operation data', error);
	}

	const row = processingOperationToRow(validated);

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

		// Синхронизируем с заявкой, если операция завершена
		if (validated.status === 'completed' || validated.status === 'failed') {
			syncOperationToApplication(validated);
		}

		return validated;
	} catch (error) {
		throw new StorageError('Failed to create operation', error as Error);
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
 * Получает список id операций для заявки
 */
export function getOperationsByApplication(
	applicationId: string,
	type?: ProcessingOperationType
): string[] {
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

		return rows.map((row) => row.id);
	} catch (error) {
		throw new StorageError('Failed to list operations', error as Error);
	}
}

/**
 * Обновляет операцию (полная перезапись)
 * Сохраняет createdAt и applicationId из существующей операции
 */
export function updateOperation(
	id: string,
	operation: ProcessingOperation
): ProcessingOperation | null {
	const db = getDatabase();

	// Получаем текущую операцию
	const current = getOperation(id);
	if (!current) {
		return null;
	}

	// Сохраняем createdAt и applicationId из существующей операции
	const updated: ProcessingOperation = {
		...operation,
		id,
		createdAt: current.createdAt,
		applicationId: current.applicationId
	};

	// Валидация
	let validated: ProcessingOperation;
	try {
		validated = ProcessingOperationSchema.parse(updated);
	} catch (error) {
		throw new ValidationError('Invalid operation data', error);
	}

	const row = processingOperationToRow(validated);

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

		// Синхронизируем с заявкой, если операция завершена
		if (validated.status === 'completed' || validated.status === 'failed') {
			syncOperationToApplication(validated);
		}

		return validated;
	} catch (error) {
		throw new StorageError('Failed to update operation', error as Error);
	}
}

/**
 * Синхронизирует результат завершенной операции с таблицей applications
 * Обновляет соответствующее поле в заявке на основе типа операции
 *
 * @param operation - Операция обработки
 * @returns true если синхронизация выполнена, false если операция не завершена или не требует синхронизации
 */
function syncOperationToApplication(operation: ProcessingOperation): boolean {
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
				// Проверяем, есть ли ошибка в result
				if (operation.result && 'error' in operation.result) {
					// Операция завершена с ошибкой, не синхронизируем
					return false;
				}
				const result = operation.result as { text?: string };
				if (result?.text) {
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
				// Проверяем, есть ли ошибка в result
				if (operation.result && 'error' in operation.result) {
					// Операция завершена с ошибкой, не синхронизируем
					return false;
				}
				const result = operation.result as { type?: string; confidence?: number; reasoning?: string };
				if (result?.type) {
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
				// Проверяем, есть ли ошибка в result
				if (operation.result && 'error' in operation.result) {
					// Операция завершена с ошибкой, не синхронизируем
					return false;
				}
				const result = operation.result as {
					parameters?: unknown[];
					abbreviation?: string;
					technicalSpecId?: string;
					generatedAt?: string;
				};
				if (result?.parameters || result?.abbreviation) {
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

