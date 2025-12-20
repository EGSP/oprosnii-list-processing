import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getOperation} from '$lib/storage/index.js';
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
