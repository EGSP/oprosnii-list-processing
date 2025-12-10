// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { getApplication } from '$lib/storage/index.js';
// import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
// import { checkAndUpdateOperation, ProcessingError } from '$lib/business/processing.js';
// import { logger } from '$lib/utils/logger.js';

// /**
//  * POST /api/applications/:id/operations/:operationId/check - Проверка статуса операции
//  *
//  * Проверяет статус асинхронной операции у внешнего сервиса и обновляет его в БД.
//  */
// export const POST: RequestHandler = async ({ params }) => {
// 	const { id, operationId } = params;

// 	try {
// 		logger.info('Проверка статуса операции', { applicationId: id, operationId });

// 		// Валидация UUID
// 		const uuidError = requireValidUUID(id);
// 		if (uuidError) {
// 			logger.warn('Неверный формат UUID заявки', { applicationId: id });
// 			return uuidError;
// 		}

// 		const operationUuidError = requireValidUUID(operationId);
// 		if (operationUuidError) {
// 			logger.warn('Неверный формат UUID операции', { operationId });
// 			return operationUuidError;
// 		}

// 		// Проверяем существование заявки
// 		const application = getApplication(id);
// 		if (!application) {
// 			logger.warn('Заявка не найдена', { applicationId: id });
// 			return json({ error: 'Заявка не найдена' }, { status: 404 });
// 		}

// 		// Проверяем и обновляем статус операции
// 		const updatedOperation = await checkAndUpdateOperation(operationId);
// 		if (!updatedOperation) {
// 			logger.warn('Операция не найдена', { applicationId: id, operationId });
// 			return json({ error: 'Операция не найдена' }, { status: 404 });
// 		}

// 		// Проверяем, что операция принадлежит заявке
// 		if (updatedOperation.applicationId !== id) {
// 			logger.warn('Операция не принадлежит указанной заявке', {
// 				applicationId: id,
// 				operationId,
// 				operationApplicationId: updatedOperation.applicationId
// 			});
// 			return json({ error: 'Операция не принадлежит указанной заявке' }, { status: 400 });
// 		}

// 		logger.info('Статус операции обновлен', {
// 			applicationId: id,
// 			operationId,
// 			status: updatedOperation.status,
// 			type: updatedOperation.task
// 		});

// 		// Возвращаем обновленный статус
// 		return json(updatedOperation);
// 	} catch (err) {
// 		// Обработка ошибок обработки
// 		if (err instanceof ProcessingError) {
// 			logger.error('Ошибка при проверке статуса операции', {
// 				applicationId: id,
// 				operationId,
// 				message: err.message,
// 				details: err.cause?.message,
// 				stack: err.cause?.stack || err.stack
// 			});
// 			return json(
// 				{
// 					error: err.message,
// 					details: err.cause?.message
// 				},
// 				{ status: 500 }
// 			);
// 		}

// 		// Обработка ошибок хранилища
// 		logger.error('Неожиданная ошибка при проверке статуса операции', {
// 			applicationId: id,
// 			operationId,
// 			error: err instanceof Error ? err.message : String(err),
// 			stack: err instanceof Error ? err.stack : undefined
// 		});
// 		return handleStorageError(err);
// 	}
// };
