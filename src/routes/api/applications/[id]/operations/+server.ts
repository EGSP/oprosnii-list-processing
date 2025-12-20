import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, findOperations } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import type { ProcessingOperationTask } from '$lib/business/types.js';
import { Effect } from 'effect';

/**
 * GET /api/applications/:id/operations - Список операций заявки
 *
 * Возвращает список всех операций для заявки с опциональной фильтрацией по типу.
 * Автоматически синхронизирует результаты завершенных операций с заявкой.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError) {
		return uuidError;
	}
	
	// Получаем тип из query параметров (опционально)
	const typeParam = url.searchParams.get('type');
	const type: ProcessingOperationTask | undefined = typeParam
		? (typeParam as ProcessingOperationTask)
		: undefined;

	// Получаем список id операций
	const operationIds = await Effect.runPromise(findOperations(id, type)).catch((error) => handleStorageError(error));

	if (operationIds instanceof Response) {
		return operationIds;
	}

	// Возвращаем результат (массив id)
	return json(operationIds);
};
