import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import { checkAndUpdateOperation, ProcessingError } from '$lib/business/processing.js';

/**
 * POST /api/applications/:id/operations/:operationId/check - Проверка статуса операции
 *
 * Проверяет статус асинхронной операции у внешнего сервиса и обновляет его в БД.
 */
export const POST: RequestHandler = async ({ params }) => {
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

		// Проверяем существование заявки
		const application = getApplication(id);
		if (!application) {
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		// Проверяем и обновляем статус операции
		const updatedOperation = await checkAndUpdateOperation(operationId);
		if (!updatedOperation) {
			return json({ error: 'Операция не найдена' }, { status: 404 });
		}

		// Проверяем, что операция принадлежит заявке
		if (updatedOperation.applicationId !== id) {
			return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
		}

		// Возвращаем обновленный статус
		return json(updatedOperation);
	} catch (err) {
		// Обработка ошибок обработки
		if (err instanceof ProcessingError) {
			return json(
				{
					error: err.message,
					details: err.cause?.message
				},
				{ status: 500 }
			);
		}

		// Обработка ошибок хранилища
		return handleStorageError(err);
	}
};
