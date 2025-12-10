// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { createApplication, listApplications } from '$lib/storage/index.js';
// import { storeFile } from '$lib/storage/index.js';
// import {
// 	handleStorageError,
// 	parseApplicationFilters,
// 	validateFileSize,
// 	validateFileType
// } from '$lib/api/index.js';

// /**
//  * POST /api/applications - Загрузка файла заявки
//  */
// export const POST: RequestHandler = async ({ request }) => {
// 	try {
// 		// Получаем данные формы
// 		const formData = await request.formData();
// 		const file = formData.get('file') as File | null;

// 		if (!file) {
// 			return json({ error: 'Файл не указан' }, { status: 400 });
// 		}

// 		// Валидация типа файла
// 		const fileTypeError = validateFileType(file.type);
// 		if (fileTypeError) {
// 			return fileTypeError;
// 		}

// 		// Валидация размера файла
// 		const fileSizeError = validateFileSize(file.size);
// 		if (fileSizeError) {
// 			return fileSizeError;
// 		}

// 		// Создаем заявку в БД
// 		const application = createApplication(file.name);

// 		// Конвертируем File в Buffer
// 		const arrayBuffer = await file.arrayBuffer();
// 		const buffer = Buffer.from(arrayBuffer);

// 		// Сохраняем файл
// 		storeFile(buffer, application.id, file.name);

// 		// Возвращаем ответ
// 		return json(
// 			{
// 				id: application.id,
// 				originalFilename: application.originalFilename,
// 				arrivalDate: application.arrivalDate
// 			},
// 			{ status: 201 }
// 		);
// 	} catch (err) {
// 		return handleStorageError(err);
// 	}
// };

// /**
//  * GET /api/applications - Список заявок
//  */
// export const GET: RequestHandler = async (event) => {
// 	try {
// 		// Парсим фильтры из query параметров
// 		const filters = parseApplicationFilters(event);
// 		if (filters.error) {
// 			return filters.error;
// 		}

// 		// Получаем список заявок
// 		const applications = listApplications({
// 			startDate: filters.startDate,
// 			endDate: filters.endDate,
// 			productType: filters.productType
// 		});

// 		return json(applications);
// 	} catch (err) {
// 		return handleStorageError(err);
// 	}
// };
