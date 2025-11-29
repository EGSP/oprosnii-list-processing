import { join } from 'path';
import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	unlinkSync,
	statSync,
	readdirSync,
	rmdirSync
} from 'fs';
import { config } from '../config.js';
import { FileStorageError } from './errors.js';

/**
 * Сохраняет файл заявки в хранилище
 * @param fileBuffer - Buffer с содержимым файла
 * @param guid - GUID заявки
 * @param originalFilename - Оригинальное имя файла (для сохранения расширения)
 * @returns Путь к сохраненному файлу
 */
export function saveApplicationFile(
	fileBuffer: Buffer,
	guid: string,
	originalFilename: string
): string {
	try {
		// Создаем директорию для заявки
		const applicationDir = join(process.cwd(), config.uploadsDirectory, guid);
		mkdirSync(applicationDir, { recursive: true });

		// Сохраняем оригинальное расширение
		const extension = originalFilename.split('.').pop() || '';
		const filename = `${guid}.${extension}`;
		const filePath = join(applicationDir, filename);

		writeFileSync(filePath, fileBuffer);

		return filePath;
	} catch (error) {
		throw new FileStorageError(`Failed to save file for application ${guid}`, error as Error);
	}
}

/**
 * Получает путь к файлу заявки
 */
export function getApplicationFilePath(guid: string): string | null {
	const applicationDir = join(process.cwd(), config.uploadsDirectory, guid);

	if (!existsSync(applicationDir)) {
		return null;
	}

	// Ищем файл в директории заявки
	// Файл может иметь GUID как имя, с любым расширением
	const files = readdirSync(applicationDir);
	const file = files.find((f: string) => f.startsWith(guid));

	if (!file) {
		return null;
	}

	return join(applicationDir, file);
}

/**
 * Читает файл заявки
 */
export function getApplicationFile(guid: string): { buffer: Buffer; filename: string } | null {
	const filePath = getApplicationFilePath(guid);

	if (!filePath || !existsSync(filePath)) {
		return null;
	}

	const buffer = readFileSync(filePath);
	const filename = filePath.split(/[/\\]/).pop() || guid;

	return { buffer, filename };
}

/**
 * Проверяет существование файла заявки
 */
export function applicationFileExists(guid: string): boolean {
	return getApplicationFilePath(guid) !== null;
}

/**
 * Удаляет файл заявки
 */
export function deleteApplicationFile(guid: string): boolean {
	const filePath = getApplicationFilePath(guid);

	if (!filePath || !existsSync(filePath)) {
		return false;
	}

	try {
		unlinkSync(filePath);

		// Удаляем директорию заявки, если она пуста
		const applicationDir = join(process.cwd(), config.uploadsDirectory, guid);
		const files = readdirSync(applicationDir);
		if (files.length === 0) {
			rmdirSync(applicationDir);
		}

		return true;
	} catch (error) {
		throw new FileStorageError(`Failed to delete file for application ${guid}`, error as Error);
	}
}

/**
 * Получает информацию о файле (размер, дата изменения)
 */
export function getApplicationFileInfo(guid: string): { size: number; modified: Date } | null {
	const filePath = getApplicationFilePath(guid);

	if (!filePath || !existsSync(filePath)) {
		return null;
	}

	const stats = statSync(filePath);
	return {
		size: stats.size,
		modified: stats.mtime
	};
}
