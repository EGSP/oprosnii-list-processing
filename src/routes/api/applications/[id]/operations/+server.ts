import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, findOperations } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import type { ProcessingOperationTask } from '$lib/business/types.js';

/**
 * GET /api/applications/:id/operations - Список операций заявки
 *
 * Возвращает список всех операций для заявки с опциональной фильтрацией по типу.
 * Автоматически синхронизирует результаты завершенных операций с заявкой.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
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
		const operationIdsResult = findOperations(id, type);
        if (operationIdsResult.isErr()) {
            return handleStorageError(operationIdsResult.error);
        }
        const operationIds = operationIdsResult.value;

		// Возвращаем результат (массив id)
		return json(operationIds);
	} catch (err) {
		return handleStorageError(err);
	}
};
