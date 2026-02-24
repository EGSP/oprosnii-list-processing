import { error, fail, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { DB, saveUploadedFile } from '$lib/storage/index.js';
import {
	validateFileSize,
	validateFileType
} from '$lib/api/utils.js';
import { Effect } from 'effect';
import { ApplicationsDB, type ApplicationGetProperties } from '$lib/storage/applications.js';
import { StatusCodes } from 'http-status-codes';

/**
 * POST /api/applications - Загрузка файла заявки
 */
export const POST: RequestHandler = async ({ url, request }) => {

	const method = url.searchParams.get('method');
	if (method === 'upload') {
		return await UPLOAD_HANDLER(request);
	} else if (method === 'get') {
		return await GET_HANDLER(request);
	}

	return error(StatusCodes.BAD_REQUEST, 'Неизвестный метод');
};


const UPLOAD_HANDLER = async (request: Request) => {
	// Получаем данные формы
	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file)
		return error(StatusCodes.BAD_REQUEST, 'Файл не указан');

	// Валидация типа файла
	const fileTypeError = validateFileType(file.type);
	if (fileTypeError)
		return fileTypeError;

	// Валидация размера файла
	const fileSizeError = validateFileSize(file.size);
	if (fileSizeError)
		return fileSizeError;

	// Конвертируем File в Buffer
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	// Создаем заявку в БД и сохраняем файл
	const application = await Effect.runPromise(
		Effect.gen(function* () {
			const application = yield* ApplicationsDB.create(file.name);
			yield* saveUploadedFile(buffer, application.id, file.name);
			return application;
		})
	).catch((error) => new Error(error.message));

	if (application instanceof Error)
		return error(StatusCodes.INTERNAL_SERVER_ERROR, application.message);

	// Возвращаем ответ
	return json(
		{
			id: application.id,
			originalFilename: application.originalFilename,
			uploadDate: application.uploadDate
		},
		{ status: StatusCodes.CREATED }
	);
};

/**
 * GET /api/applications - Список заявок
 */
const GET_HANDLER = async (request: Request) => {

	const applicationGetParameters = await request.json() as ApplicationGetProperties;

	// Получаем список заявок
	const applications = await Effect.runPromise(ApplicationsDB.get(applicationGetParameters))
		.catch((error) => new Error(error.message));

	if (applications instanceof Error)
		return error(StatusCodes.INTERNAL_SERVER_ERROR, applications.message);

	return json(applications, { status: StatusCodes.OK });
};
