// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { getApplication } from '$lib/storage/index.js';
// import { processProductTypeResolve } from '$lib/business/processing.js';

// /**
//  * POST /api/applications/:id/detect-product-type - Определение типа изделия
//  *
//  * Определяет тип изделия из заявки с использованием OCR и LLM.
//  */
// export const POST: RequestHandler = async ({ params }) => {
// 	const { id } = params;

// 	return await getApplication(id)
// 		.asyncAndThen((application) => processProductTypeResolve(application.id))
// 		.map(() => json({ success: true }))
// 		.mapErr((error) => json({ error: error.message }, { status: 500 }))
// 		.match(
// 			(success) => success,
// 			(error) => error
// 		);
// };
