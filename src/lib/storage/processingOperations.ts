import { getDatabase } from './db.js';
import {
	type ProcessingOperation,
	type ProcessingOperationTask,
	type ProcessingOperationStatus,
	ProcessingOperationSchema
} from '../business/types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, OperationNotFoundError, OperationAlreadyExistsError } from './errors.js';
import { Effect, pipe } from 'effect';
import { safeJsonParse } from '$lib/utils/json.js';
import { parseZodSchema } from '$lib/utils/zod.js';

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
export function getOperation(id: string): Effect.Effect<ProcessingOperation, StorageError> {
	return Effect.gen(function* () {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM processing_operations WHERE id = ?');
		const row = yield* Effect.try({
			try: () => stmt.get(id) as ProcessingOperationRow | undefined,
			catch: (error) => new StorageError('Failed to get operation', error as Error)
		});

		if (!row) {
			return yield* Effect.fail(new OperationNotFoundError(id));
		}

		return rowToOperation(row);
	});
}

/**
 * Получает операции по фильтру
 * @param filter - Фильтр
 * @returns Effect с ошибкой или массивом операций
 */
export function getOperationsByFilter(applicationId: string, filter: { task?: ProcessingOperationTask, status?: ProcessingOperationStatus }):
	Effect.Effect<ProcessingOperation[], StorageError> {
	return Effect.try({
		try: () => {
			const db = getDatabase();
			let query = 'SELECT * FROM processing_operations WHERE application_id = ?';
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
			const rows = stmt.all(...params) as ProcessingOperationRow[];
			// Если операций нет, возвращаем пустой массив (это нормальная ситуация)
			return rows.map((row) => rowToOperation(row));
		},
		catch: (error) => new StorageError('Failed to get operations by filter', error as Error)
	});
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
): Effect.Effect<ProcessingOperation, StorageError> {
	return Effect.gen(function* () {
		// Проверяем, существует ли операция с таким типом для заявки
		const existingIds = yield* findOperationsByFilter(applicationId, { task });
		if (existingIds.length > 0) {
			return yield* Effect.fail(new OperationAlreadyExistsError(applicationId, task));
		}

		// Создаем новую операцию
		const now = new Date().toISOString();
		const operationData = {
			id: uuidv4(),
			applicationId,
			task,
			status,
			data,
			startDate: now,
			finishDate: status === 'completed' || status === 'failed' ? now : null
		};

		const operation = yield* parseZodSchema(operationData, ProcessingOperationSchema).pipe(
			Effect.mapError((error) => new StorageError('Invalid processing operation data', error))
		);

		const row = operationToRow(operation);

		yield* Effect.try({
			try: () => {
				const db = getDatabase();
				const stmt = db.prepare(`
					INSERT INTO processing_operations (
						id, application_id, task, status, data, start_date, finish_date
					) VALUES (
						:id, :application_id, :task, :status, :data, :start_date, :finish_date
					)
				`);
				stmt.run(row);
			},
			catch: (error) => new StorageError('Failed to create operation', error as Error)
		});

		return operation;
	});
}

/**
 * Обновляет операцию
 * Сохраняет startDate и applicationId из существующей операции
 */
export function updateOperation(
	id: string,
	updates: Partial<Pick<ProcessingOperation, 'status' | 'data' | 'finishDate'>>
): Effect.Effect<ProcessingOperation, StorageError> {
	return Effect.gen(function* () {
		// Получаем текущую операцию
		const current = yield* getOperation(id);

		// Объединяем обновления с текущими данными
		const updated: ProcessingOperation = {
			...current,
			...updates
		};

		// Валидация
		const validated = yield* parseZodSchema(updated, ProcessingOperationSchema).pipe(
			Effect.mapError((error) => new StorageError('Invalid operation data', error))
		);

		const row = operationToRow(validated);

		yield* Effect.try({
			try: () => {
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
			},
			catch: (error) => new StorageError('Failed to update operation', error as Error)
		});

		return validated;
	});
}

export function deleteOperation(id: string): Effect.Effect<void, StorageError> {
	return Effect.try({
		try: () => {
			const db = getDatabase();
			const stmt = db.prepare('DELETE FROM processing_operations WHERE id = ?');
			stmt.run(id);
		},
		catch: (error) => new StorageError('Failed to delete operation', error as Error)
	});
}

export function deleteOperations(ids: string[]): Effect.Effect<void, StorageError> {
	return Effect.try({
		try: () => {
			const db = getDatabase();
			const stmt = db.prepare('DELETE FROM processing_operations WHERE id IN (?)');
			stmt.run(ids);
		},
		catch: (error) => new StorageError('Failed to delete operations', error as Error)
	});
}

/**
 * Находит id операций по applicationId и task
 */
export function findOperations(
	applicationId: string,
	task?: ProcessingOperationTask
): Effect.Effect<string[], StorageError> {
	return Effect.try({
		try: () => {
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

			return rows.map((row) => row.id);
		},
		catch: (error) => new StorageError('Failed to list operations', error as Error)
	});
}

export function findOperationsByFilter(applicationId: string,
	filter: { task?: ProcessingOperationTask, status?: ProcessingOperationStatus }): Effect.Effect<string[], StorageError> {
	return Effect.try({
		try: () => {
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
			return rows.map((row) => row.id);
		},
		catch: (error) => new StorageError('Failed to list operations', error as Error)
	});
}