import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import { detectProductType, ProcessingError } from '$lib/business/processing.js';
import { logger } from '$lib/utils/logger.js';

/**
 * POST /api/applications/:id/detect-product-type - Определение типа изделия
 *
 * Определяет тип изделия из заявки с использованием OCR и LLM.
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		logger.info('Начало определения типа изделия', { applicationId: id });

		// Валидация UUID
		const uuidError = requireValidUUID(id);
		if (uuidError) {
			logger.warn('Неверный формат UUID', { applicationId: id });
			return uuidError;
		}

		// Проверяем существование заявки
		const application = getApplication(id);
		if (!application) {
			logger.warn('Заявка не найдена', { applicationId: id });
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		// Определяем тип изделия
		const result = await detectProductType(id);

		logger.info('Тип изделия успешно определен', {
			applicationId: id,
			productType: result.result.type,
			confidence: result.result.confidence,
			ocrOperationId: result.ocrOperationId,
			llmOperationId: result.llmOperationId
		});

		// Возвращаем результат с ID операций
		return json({
			type: result.result.type,
			confidence: result.result.confidence,
			reasoning: result.result.reasoning,
			operations: {
				ocr: result.ocrOperationId,
				llm: result.llmOperationId
			}
		});
	} catch (err) {
		// Обработка ошибок обработки
		if (err instanceof ProcessingError) {
			logger.error('Ошибка при определении типа изделия', {
				applicationId: id,
				message: err.message,
				details: err.cause?.message,
				stack: err.cause?.stack || err.stack
			});
			return json(
				{
					error: err.message,
					details: err.cause?.message
				},
				{ status: 500 }
			);
		}

		// Обработка ошибок хранилища
		logger.error('Неожиданная ошибка при определении типа изделия', {
			applicationId: id,
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined
		});
		return handleStorageError(err);
	}
};
