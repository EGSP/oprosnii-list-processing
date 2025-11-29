import { getDatabase, rowToProcessingOperation, processingOperationToRow } from './db.js';
import {
	ProcessingOperation,
	ProcessingOperationUpdate,
	ProcessingOperationType,
	ProcessingOperationStatus,
	ProcessingOperationSchema
} from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, OperationNotFoundError, ValidationError } from './errors.js';

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
		const row = stmt.get(id) as any;

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
		const row = stmt.get(applicationId, type) as any;

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
		const params: any[] = [applicationId];

		if (type) {
			query += ' AND type = ?';
			params.push(type);
		}

		query += ' ORDER BY created_at DESC';

		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as any[];

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
