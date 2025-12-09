import { getDatabase } from './db.js';
import {
	type ProcessingOperation,
	type ProcessingOperationTask,
	type ProcessingOperationStatus,
	ProcessingOperationSchema
} from '../business/types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, ValidationError, OperationAlreadyExistsError } from './errors.js';
import { err, ok, Result } from 'neverthrow';
import { safeJsonParse } from '$lib/utils/json.js';

/**
 * Интерфейс строки из БД для ProcessingOperation
 */
export interface ProcessingOperationRow {
	id: string;
	application_id: string;
	task: string;
	status: string;
	data: string;
	start_date: string;
	finish_date: string | null;
}

/**
 * Преобразует строку из БД в объект ProcessingOperation
 */
export function rowToOperation(row: ProcessingOperationRow): ProcessingOperation {
	return {
		id: row.id,
		applicationId: row.application_id,
		task: row.task as ProcessingOperation['task'],
		status: row.status as ProcessingOperation['status'],
		data: safeJsonParse<ProcessingOperation['data']>(row.data) || {},
		startDate: row.start_date,
		finishDate: row.finish_date || null
	};
}

/**
 * Преобразует объект ProcessingOperation в формат для записи в БД
 */
export function operationToRow(operation: ProcessingOperation): ProcessingOperationRow {
	return {
		id: operation.id,
		application_id: operation.applicationId,
		task: operation.task,
		status: operation.status,
		data: JSON.stringify(operation.data),
		start_date: operation.startDate,
		finish_date: operation.finishDate ?? null
	};
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

		return ok(rowToOperation(row));
	} catch (error) {
		return err(new StorageError('Failed to get operation', error as Error));
	}
}


/**
 * Создает новую операцию обработки
 * Если операция с таким (applicationId, task) уже существует - возвращает ошибку
 */
export function createOperation(
	applicationId: string,
	task: ProcessingOperationTask,
	data: Record<string, unknown> = {},
	status: ProcessingOperationStatus = 'started'
): Result<ProcessingOperation, Error> {
	// Проверяем, существует ли операция с таким типом для заявки
	const existingResult = findOperations(applicationId, task);
	if (existingResult.isOk()) {
		return err(new OperationAlreadyExistsError(applicationId, task));
	}

	// Создаем новую операцию
	const now = new Date().toISOString();
	let operation: ProcessingOperation;
	try {
		operation = ProcessingOperationSchema.parse({
			id: uuidv4(),
			applicationId,
			task,
			status,
			data,
			startDate: now,
			finishDate: status === 'completed' || status === 'failed' ? now : null
		});
	} catch (error) {
		return err(new ValidationError('Invalid processing operation data', error));
	}

	const row = operationToRow(operation);

	try {
		const db = getDatabase();
		const stmt = db.prepare(`
			INSERT INTO processing_operations (
				id, application_id, task, status, data, start_date, finish_date
			) VALUES (
				:id, :application_id, :task, :status, :data, :start_date, :finish_date
			)
		`);
		stmt.run(row);

		return ok(operation);
	} catch (error) {
		return err(new StorageError('Failed to create operation', error as Error));
	}
}

/**
 * Обновляет операцию
 * Сохраняет startDate и applicationId из существующей операции
 */
export function updateOperation(
	id: string,
	updates: Partial<Pick<ProcessingOperation, 'status' | 'data' | 'finishDate'>>
): Result<ProcessingOperation, Error> {
	// Получаем текущую операцию
	const currentOperation = getOperation(id);
	if (currentOperation.isErr()) {
		return currentOperation;
	}

	const current = currentOperation.value;

	// Объединяем обновления с текущими данными
	const updated: ProcessingOperation = {
		...current,
		...updates
	};

	// Валидация
	let validated: ProcessingOperation;
	try {
		validated = ProcessingOperationSchema.parse(updated);
	} catch (error) {
		return err(new ValidationError('Invalid operation data', error));
	}

	const row = operationToRow(validated);

	try {
		const db = getDatabase();
		const stmt = db.prepare(`
			UPDATE processing_operations SET
				status = :status,
				data = :data,
				finish_date = :finish_date
			WHERE id = :id
		`);
		stmt.run({
			status: row.status,
			data: row.data,
			finish_date: row.finish_date,
			id: row.id
		});

		return ok(validated);
	} catch (error) {
		return err(new StorageError('Failed to update operation', error as Error));
	}
}

export function deleteOperation(id: string): Result<void, Error> {
	try {
		const db = getDatabase();
		const stmt = db.prepare('DELETE FROM processing_operations WHERE id = ?');
		stmt.run(id);
		return ok(undefined);
	} catch (error) {
		return err(new StorageError('Failed to delete operation', error as Error));
	}
}


/**
 * Находит id операций по applicationId и task
 */
export function findOperations(
	applicationId: string,
	task?: ProcessingOperationTask
): Result<string[], Error> {
	try {
		const db = getDatabase();
		let query = 'SELECT id FROM processing_operations WHERE application_id = ?';
		const params: (string | ProcessingOperationTask)[] = [applicationId];

		if (task) {
			query += ' AND task = ?';
			params.push(task);
		}

		query += ' ORDER BY start_date DESC';

		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as { id: string }[];

		return ok(rows.map((row) => row.id));
	} catch (error) {
		return err(new StorageError('Failed to list operations', error as Error));
	}
}

export function findOperationsByFilter(applicationId: string,
	filter: { task?: ProcessingOperationTask, status?: ProcessingOperationStatus }): Result<string[], Error> {
	try {
		const db = getDatabase();
		let query = 'SELECT id FROM processing_operations WHERE application_id = ?';
		const params: (string | ProcessingOperationTask | ProcessingOperationStatus)[] = [applicationId];

		if (filter.task) {
			query += ' AND task = ?';
			params.push(filter.task);
		}

		if (filter.status) {
			query += ' AND status = ?';
			params.push(filter.status);
		}

		query += ' ORDER BY start_date DESC';

		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as { id: string }[];
		return ok(rows.map((row) => row.id));
	} catch (error) {
		return err(new StorageError('Failed to list operations', error as Error));
	}

}