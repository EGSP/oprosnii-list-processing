// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { getTechnicalSpec } from '$lib/storage/index.js';
// import { handleStorageError } from '$lib/api/index.js';

// /**
//  * GET /api/technical-specs/:id - Получение технического условия
//  */
// export const GET: RequestHandler = async ({ params }) => {
// 	try {
// 		const { id } = params;
// 		const spec = getTechnicalSpec(id);

// 		if (!spec) {
// 			return json({ error: 'Техническое условие не найдено' }, { status: 404 });
// 		}

// 		return json(spec);
// 	} catch (err) {
// 		return handleStorageError(err);
// 	}
// };
