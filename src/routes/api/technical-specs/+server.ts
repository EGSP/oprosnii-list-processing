// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { listTechnicalSpecs } from '$lib/storage/index.js';
// import { handleStorageError } from '$lib/api/index.js';

// /**
//  * GET /api/technical-specs - Список технических условий
//  */
// export const GET: RequestHandler = async () => {
// 	try {
// 		const specs = listTechnicalSpecs();
// 		return json(specs);
// 	} catch (err) {
// 		return handleStorageError(err);
// 	}
// };
