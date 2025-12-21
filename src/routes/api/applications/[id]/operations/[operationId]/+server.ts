import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getOperation, deleteOperation, updateOperation} from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { Effect } from 'effect';

/**
 * GET /api/applications/:id/operations/:operationId - Получение операции
 *
 * Возвращает детальную информацию об операции обработки.
 * Автоматически синхронизирует результат завершенной операции с заявкой.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id, operationId } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError) {
		return uuidError;
	}

	const operationUuidError = requireValidUUID(operationId);
	if (operationUuidError) {
		return operationUuidError;
	}

	// Получаем операцию
	const operation = await Effect.runPromise(getOperation(operationId)).catch((error) => handleStorageError(error));

	if (operation instanceof Response) {
		return operation;
	}

	// Проверяем, что операция принадлежит заявке
	if (operation.applicationId !== id) {
		return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
	}

	// Возвращаем результат
	return json(operation);
};

/**
 * PATCH /api/applications/:id/operations/:operationId - Обновление операции
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id, operationId } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError) {
		return uuidError;
	}

	const operationUuidError = requireValidUUID(operationId);
	if (operationUuidError) {
		return operationUuidError;
	}

	// Получаем операцию для проверки принадлежности к заявке
	const operation = await Effect.runPromise(getOperation(operationId, true)).catch((error) =>
		handleStorageError(error)
	);

	if (operation instanceof Response) {
		return operation;
	}

	// Проверяем, что операция принадлежит заявке
	if (operation.applicationId !== id) {
		return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
	}

	// Парсим тело запроса
	try {
		const body = await request.json();
		
		// Поддерживаем обновление deleted
		if (typeof body.deleted === 'boolean') {
			const updatedOperation = await Effect.runPromise(
				updateOperation(operationId, { deleted: body.deleted })
			).catch((error) => handleStorageError(error));
			
			if (updatedOperation instanceof Response) {
				return updatedOperation;
			}
			
			return json(updatedOperation);
		}
		
		return json({ error: 'Invalid request body. Expected { deleted: boolean }' }, { status: 400 });
	} catch (err) {
		return json({ error: 'Invalid JSON in request body' }, { status: 400 });
	}
};

/**
 * DELETE /api/applications/:id/operations/:operationId - Мягкое удаление операции
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id, operationId } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError) {
		return uuidError;
	}

	const operationUuidError = requireValidUUID(operationId);
	if (operationUuidError) {
		return operationUuidError;
	}

	// Получаем операцию для проверки принадлежности к заявке
	const operation = await Effect.runPromise(getOperation(operationId, true)).catch((error) =>
		handleStorageError(error)
	);

	if (operation instanceof Response) {
		return operation;
	}

	// Проверяем, что операция принадлежит заявке
	if (operation.applicationId !== id) {
		return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
	}

	// Выполняем мягкое удаление
	const deletedOperation = await Effect.runPromise(deleteOperation(operationId)).catch((error) =>
		handleStorageError(error)
	);

	if (deletedOperation instanceof Response) {
		return deletedOperation;
	}

	return json({ success: true, id: deletedOperation.id });
};
