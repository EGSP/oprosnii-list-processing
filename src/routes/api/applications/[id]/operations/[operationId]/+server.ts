import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getOperation} from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';

/**
 * GET /api/applications/:id/operations/:operationId - Получение операции
 *
 * Возвращает детальную информацию об операции обработки.
 * Автоматически синхронизирует результат завершенной операции с заявкой.
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
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
		const operationResult = getOperation(operationId);
		if (operationResult.isErr()) {
			return json({ error: 'Операция не найдена' }, { status: 404 });
		}
        const operation = operationResult.value;

		// Проверяем, что операция принадлежит заявке
		if (operation.applicationId !== id) {
			return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
		}

		// Возвращаем результат
		return json(operation);
	} catch (err) {
		return handleStorageError(err);
	}
};
