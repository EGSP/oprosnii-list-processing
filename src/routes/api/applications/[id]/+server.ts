import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { handleStorageError, requireValidUUID } from '$lib/api/index.js';

/**
 * GET /api/applications/:id - Получение заявки
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;

		// Валидация UUID
		const uuidError = requireValidUUID(id);
		if (uuidError) {
			return uuidError;
		}

		// Получаем заявку
		const application = getApplication(id);

		if (!application) {
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		return json(application);
	} catch (err) {
		return handleStorageError(err);
	}
};
