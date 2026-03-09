import type { FileCategory } from './files';

/**
 * Возвращает имя файла с расширением из полного пути
 * @param path - Полный путь к файлу
 * @returns Имя файла с расширением
 */

export function getFileNameWithExtension(path: string): string {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1];
}
/**
 * Возвращает имя файла без расширения из полного пути
 * @param path - Полный путь к файлу
 * @returns Имя файла без расширения
 */

export function getFileNameWithoutExtension(path: string): string {
	return path.split('.').slice(0, -1).join('.');
}

export function getFileExtension(path: string): string | null {
	return path.split('.').pop()?.toLowerCase() ?? null;
}

export function getFileCategory(path: string): FileCategory | null {
	const extension = getFileExtension(path);
	if (!extension) {
		return null;
	}
	switch (extension) {
		case 'pdf':
			return 'pdf' as FileCategory;
		case 'docx':
		case 'doc':
			return 'document' as FileCategory;
		case 'xlsx':
		case 'xls':
			return 'spreadsheet' as FileCategory;
		case 'jpeg':
		case 'jpg':
		case 'png':
			return 'image' as FileCategory;
		default:
			return null;
	}
}
