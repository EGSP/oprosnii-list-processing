import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getOperationsByApplicationWithSync } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import type { ProcessingOperationType } from '$lib/storage/types.js';

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

		// Проверяем существование заявки
		const application = getApplication(id);
		if (!application) {
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		// Получаем тип из query параметров (опционально)
		const typeParam = url.searchParams.get('type');
		const type: ProcessingOperationType | undefined = typeParam
			? (typeParam as ProcessingOperationType)
			: undefined;

		// Получаем список операций с автоматической синхронизацией
		const operations = getOperationsByApplicationWithSync(id, type);

		// Возвращаем результат
		return json(operations);
	} catch (err) {
		return handleStorageError(err);
	}
};
