import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { fetchApplication } from '$lib/business/processing.js';

/**
 * GET /api/applications/:id - Получение заявки
 */
export const GET: RequestHandler = async ({ params }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    // Получаем заявку
    const application = getApplication(id);

    if (application.isErr()) {
        return json({ error: 'Заявка не найдена' }, { status: 404 });
    }

    return json(application.value);
};

export const PATCH: RequestHandler = async ({ params }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    const applicationResult = await fetchApplication(id);
    if (applicationResult.isErr())
        return handleStorageError(applicationResult.error);

    return json({ success: true });
};