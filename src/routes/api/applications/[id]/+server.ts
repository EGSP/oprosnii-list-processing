import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { fetchApplication } from '$lib/business/processing.js';
import { Effect } from 'effect';

/**
 * GET /api/applications/:id - Получение заявки
 */
export const GET: RequestHandler = async ({ params }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    const application = await Effect.runPromise(getApplication(id)).catch((error) => handleStorageError(error));
    
    if (application instanceof Response) {
        return application;
    }
    
    return json(application);
};

export const PATCH: RequestHandler = async ({ params }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    const result = await Effect.runPromise(fetchApplication(id)).catch((error) => handleStorageError(error));
    
    if (result instanceof Response) {
        return result;
    }
    
    return json({ success: true });
};