import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createApplication, getApplications } from '$lib/storage/index.js';
import { storeFile } from '$lib/storage/index.js';
import {
    handleStorageError,
    parseApplicationFilters,
    validateFileSize,
    validateFileType
} from '$lib/api/utils.js';
import { Effect } from 'effect';

/**
 * POST /api/applications - Загрузка файла заявки
 */
export const POST: RequestHandler = async ({ request }) => {
	// Получаем данные формы
	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		return json({ error: 'Файл не указан' }, { status: 400 });
	}

	// Валидация типа файла
	const fileTypeError = validateFileType(file.type);
	if (fileTypeError) {
		return fileTypeError;
	}

	// Валидация размера файла
	const fileSizeError = validateFileSize(file.size);
	if (fileSizeError) {
		return fileSizeError;
	}

	// Конвертируем File в Buffer
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	// Создаем заявку в БД и сохраняем файл
	const application = await Effect.runPromise(
		Effect.gen(function* () {
			const app = yield* createApplication(file.name);
			yield* storeFile(buffer, app.id, file.name);
			return app;
		})
	).catch((error) => handleStorageError(error));
	
	if (application instanceof Response) {
		return application;
	}

	// Возвращаем ответ
	return json(
		{
			id: application.id,
			originalFilename: application.originalFilename,
			uploadDate: application.uploadDate
		},
		{ status: 201 }
	);
};

/**
 * GET /api/applications - Список заявок
 */
export const GET: RequestHandler = async (event) => {
    // Парсим фильтры из query параметров
    const filters = parseApplicationFilters(event);
    if (filters.error) {
        return filters.error;
    }

    // Получаем список заявок
    const applications = await Effect.runPromise(
        getApplications({
            endDate: filters.endDate,
            productType: filters.productType
        })
    ).catch((error) => handleStorageError(error));

    if (applications instanceof Response) {
        return applications;
    }

    return json(applications);
};
