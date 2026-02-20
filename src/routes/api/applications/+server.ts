import { error, fail, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { DB, saveUploadedFile } from '$lib/storage/index.js';
import {
	validateFileSize,
	validateFileType
} from '$lib/api/utils.js';
import { Effect } from 'effect';
import { createApplication, getApplications, type ApplicationGetProperties } from '$lib/storage/applications.js';

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
			const application = yield* createApplication(file.name);
			yield* saveUploadedFile(buffer, application.id, file.name);
			return application;
		})
	).catch((error) => new Error(error.message));

	if (application instanceof Error)
		return json({ error: application.message }, { status: 500 });

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
export const GET: RequestHandler = async ({ request }) => {

	const applicationGetParameters = await request.json() as ApplicationGetProperties;

	// Получаем список заявок
	const applications = await Effect.runPromise(getApplications(applicationGetParameters))
		.catch((error) => new Error(error.message));

	if (applications instanceof Error)
		return error(500, applications.message);

	return json(applications);
};
