import { json } from '@sveltejs/kit';

import type { ApiError } from './types.js';
import { config } from '$lib/config.js';

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
