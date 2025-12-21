import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, deleteApplication, updateApplication } from '$lib/storage/index.js';
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

export const PATCH: RequestHandler = async ({ params, request }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    // Проверяем, есть ли тело запроса
    const contentType = request.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        try {
            const body = await request.json();
            
            // Если есть поле deleted, обновляем статус удаления
            if (typeof body.deleted === 'boolean') {
                const application = await Effect.runPromise(
                    updateApplication(id, { deleted: body.deleted })
                ).catch((error) => handleStorageError(error));
                
                if (application instanceof Response) {
                    return application;
                }
                
                return json(application);
            }
        } catch (err) {
            return json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
    }

    // По умолчанию вызываем fetchApplication (для обратной совместимости)
    const result = await Effect.runPromise(fetchApplication(id)).catch((error) => handleStorageError(error));
    
    if (result instanceof Response) {
        return result;
    }
    
    return json({ success: true });
};

/**
 * DELETE /api/applications/:id - Мягкое удаление заявки
 */
export const DELETE: RequestHandler = async ({ params }) => {
    const { id } = params;

    // Валидация UUID
    const uuidError = requireValidUUID(id);
    if (uuidError)
        return uuidError;

    const application = await Effect.runPromise(deleteApplication(id)).catch((error) => handleStorageError(error));
    
    if (application instanceof Response) {
        return application;
    }
    
    return json({ success: true, id: application.id });
};