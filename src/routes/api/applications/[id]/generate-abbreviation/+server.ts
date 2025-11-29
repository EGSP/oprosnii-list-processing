import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getTechnicalSpec } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import type { GenerateAbbreviationRequest } from '$lib/api/types.js';
import { generateAbbreviation, ProcessingError } from '$lib/business/processing.js';

/**
 * POST /api/applications/:id/generate-abbreviation - Формирование аббревиатуры
 *
 * Формирует аббревиатуру продукции на основе параметров из заявки и технических условий.
 */
export const POST: RequestHandler = async ({ params, request }) => {
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

		// Парсим тело запроса
		let body: GenerateAbbreviationRequest;
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Неверный формат JSON в теле запроса' }, { status: 400 });
		}

		// Валидация technicalSpecId
		if (!body.technicalSpecId || typeof body.technicalSpecId !== 'string') {
			return json(
				{
					error: 'Отсутствует или неверный параметр technicalSpecId'
				},
				{ status: 400 }
			);
		}

		// Проверяем существование технического условия
		const technicalSpec = getTechnicalSpec(body.technicalSpecId);
		if (!technicalSpec) {
			return json({ error: 'Техническое условие не найдено' }, { status: 404 });
		}

		// Формируем аббревиатуру
		const result = await generateAbbreviation(id, body.technicalSpecId);

		// Возвращаем результат с ID операций
		return json({
			parameters: result.parameters,
			abbreviation: result.abbreviation,
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
