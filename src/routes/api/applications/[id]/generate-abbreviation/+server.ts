import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, notImplemented, handleStorageError } from '$lib/api/index.js';
import type { GenerateAbbreviationRequest } from '$lib/api/types.js';

/**
 * POST /api/applications/:id/generate-abbreviation - Формирование аббревиатуры
 * 
 * ⚠️ Заглушка: возвращает 501 Not Implemented
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

		// Возвращаем ошибку "не реализовано"
		return notImplemented(
			'LLM сервис не настроен. Функция будет доступна после настройки внешних сервисов.'
		);
	} catch (err) {
		return handleStorageError(err);
	}
};

