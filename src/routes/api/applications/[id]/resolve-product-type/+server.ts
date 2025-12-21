import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { processProductTypeResolve } from '$lib/business/processing.js';
import { Effect } from 'effect';

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

	const result = await Effect.runPromise(
		Effect.gen(function* () {
			const application = yield* getApplication(id);
			yield* processProductTypeResolve(application);
		})
	).catch((error) => handleStorageError(error));
	
	if (result instanceof Response) {
		return result;
	}
	
	return json({ success: true });
};

