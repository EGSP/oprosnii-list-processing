import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { processProductTypeResolve } from '$lib/business/processing.js';

/**
 * POST /api/applications/:id/resolve-product-type - Определение типа изделия
 *
 * Определяет тип изделия из заявки с использованием OCR и LLM.
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError)
		return uuidError;

	const result = await getApplication(id)
		.asyncAndThen((application) => processProductTypeResolve(application.id))
		.map(() => ({ success: true }))
		.mapErr((error) => ({ error: error.message }))
		.match(
			(success) => json(success),
			(error) => handleStorageError(new Error(error.error || 'Failed to resolve product type'))
		);

	return result;
};

