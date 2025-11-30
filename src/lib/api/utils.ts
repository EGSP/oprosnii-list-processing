import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	StorageError,
	ApplicationNotFoundError,
	TechnicalSpecNotFoundError,
	ValidationError,
	FileStorageError
} from '$lib/storage/errors.js';
import type { ApiError } from './types.js';
import { config } from '$lib/config.js';
import { logger } from '$lib/utils/logger.js';

/**
 * Обрабатывает ошибки хранилища и возвращает соответствующий HTTP ответ
 */
export function handleStorageError(err: unknown): Response {
	if (err instanceof ValidationError) {
		const validationErr = err as ValidationError;
		logger.warn('Ошибка валидации', {
			message: validationErr.message,
			details: validationErr.details
		});
		return json(
			{
				error: validationErr.message,
				details: validationErr.details
			} as ApiError,
			{ status: 400 }
		);
	}

	if (err instanceof ApplicationNotFoundError || err instanceof TechnicalSpecNotFoundError) {
		const notFoundErr = err as ApplicationNotFoundError | TechnicalSpecNotFoundError;
		logger.warn('Ресурс не найден', {
			message: notFoundErr.message,
			type: err.constructor.name
		});
		return json(
			{
				error: notFoundErr.message
			} as ApiError,
			{ status: 404 }
		);
	}

	if (err instanceof FileStorageError) {
		const fileErr = err as FileStorageError;
		logger.error('Ошибка файлового хранилища', {
			message: fileErr.message,
			stack: fileErr.stack
		});
		return json(
			{
				error: fileErr.message
			} as ApiError,
			{ status: 500 }
		);
	}

	if (err instanceof StorageError) {
		const storageErr = err as StorageError;
		logger.error('Ошибка хранилища данных', {
			message: storageErr.message || 'Ошибка хранилища данных',
			stack: storageErr.stack
		});
		return json(
			{
				error: storageErr.message || 'Ошибка хранилища данных'
			} as ApiError,
			{ status: 500 }
		);
	}

	// Неизвестная ошибка
	logger.error('Неожиданная ошибка в handleStorageError', {
		error: err instanceof Error ? err.message : String(err),
		stack: err instanceof Error ? err.stack : undefined,
		type: err?.constructor?.name || typeof err
	});
	return json(
		{
			error: 'Внутренняя ошибка сервера'
		} as ApiError,
		{ status: 500 }
	);
}

/**
 * Валидирует UUID формат
 */
export function validateUUID(uuid: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

/**
 * Валидирует UUID и возвращает ошибку, если невалиден
 */
export function requireValidUUID(uuid: string): Response | null {
	if (!validateUUID(uuid)) {
		return json(
			{
				error: 'Неверный формат UUID'
			} as ApiError,
			{ status: 400 }
		);
	}
	return null;
}

/**
 * Парсит и валидирует query параметры для фильтрации заявок
 */
export function parseApplicationFilters(event: RequestEvent): {
	startDate?: Date;
	endDate?: Date;
	productType?: string;
	error?: Response;
} {
	const url = event.url;
	const startDateStr = url.searchParams.get('startDate');
	const endDateStr = url.searchParams.get('endDate');
	const productType = url.searchParams.get('productType');

	let startDate: Date | undefined;
	let endDate: Date | undefined;

	if (startDateStr) {
		startDate = new Date(startDateStr);
		if (isNaN(startDate.getTime())) {
			return {
				error: json(
					{
						error: 'Неверный формат даты в параметре startDate'
					} as ApiError,
					{ status: 400 }
				)
			};
		}
	}

	if (endDateStr) {
		endDate = new Date(endDateStr);
		if (isNaN(endDate.getTime())) {
			return {
				error: json(
					{
						error: 'Неверный формат даты в параметре endDate'
					} as ApiError,
					{ status: 400 }
				)
			};
		}
	}

	return {
		startDate,
		endDate,
		productType: productType || undefined
	};
}

/**
 * Проверяет, поддерживается ли тип файла
 */
export function isSupportedFileType(mimeType: string): boolean {
	const allSupportedTypes: readonly string[] = [
		...config.supportedFileTypes.documents,
		...config.supportedFileTypes.spreadsheets,
		...config.supportedFileTypes.images
	];

	return (allSupportedTypes as string[]).includes(mimeType);
}

/**
 * Определяет Content-Type по расширению файла
 */
export function getContentTypeFromFilename(filename: string): string {
	const extension = filename.split('.').pop()?.toLowerCase();

	const mimeTypes: Record<string, string> = {
		pdf: 'application/pdf',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg'
	};

	return mimeTypes[extension || ''] || 'application/octet-stream';
}

/**
 * Валидирует размер файла
 */
export function validateFileSize(size: number): Response | null {
	if (size > config.maxFileSizeBytes) {
		return json(
			{
				error: `Размер файла превышает максимальный лимит (${config.maxFileSizeMB} MB)`
			} as ApiError,
			{ status: 413 }
		);
	}
	return null;
}

/**
 * Валидирует тип файла
 */
export function validateFileType(mimeType: string): Response | null {
	if (!isSupportedFileType(mimeType)) {
		return json(
			{
				error: `Неподдерживаемый тип файла: ${mimeType}`
			} as ApiError,
			{ status: 415 }
		);
	}
	return null;
}

/**
 * Создает ответ с ошибкой "Not Implemented"
 */
export function notImplemented(message: string): Response {
	return json(
		{
			error: message
		} as ApiError,
		{ status: 501 }
	);
}
