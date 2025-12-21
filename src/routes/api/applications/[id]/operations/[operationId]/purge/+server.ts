import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOperation, purgeOperation } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { Effect } from 'effect';

/**
 * POST /api/applications/:id/operations/:operationId/purge - Полное удаление операции (hard delete)
 */
export const POST: RequestHandler = async ({ params }) => {
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

	// Выполняем полное удаление
	const purgeResult = await Effect.runPromise(purgeOperation(operationId)).catch((error) =>
		handleStorageError(error)
	);

	if (purgeResult instanceof Response) {
		return purgeResult;
	}

	return json({ success: true, id: operationId });
};

