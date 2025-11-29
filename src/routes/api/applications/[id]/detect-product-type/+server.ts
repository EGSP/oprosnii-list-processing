import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import { detectProductType, ProcessingError } from '$lib/business/processing.js';

/**
 * POST /api/applications/:id/detect-product-type - Определение типа изделия
 *
 * Определяет тип изделия из заявки с использованием OCR и LLM.
 */
export const POST: RequestHandler = async ({ params }) => {
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

		// Определяем тип изделия
		const result = await detectProductType(id);

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
