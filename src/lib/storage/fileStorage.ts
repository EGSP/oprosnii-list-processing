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
import { getOperationByApplicationAndTypeWithSync } from './operationsRepository.js';
import { logger } from '../utils/logger.js';
import { PDFDocument } from 'pdf-lib';


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

/**
 * Определяет MIME тип по расширению файла
 */
function getMimeTypeFromFilename(filename: string): string {
	const extension = filename.split('.').pop()?.toLowerCase();

	switch (extension) {
		case 'pdf':
			return 'application/pdf';
		case 'docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		case 'xlsx':
			return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Определяет тип файла по MIME типу
 */
function getFileType(mimeType: string): 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown' {
	if (mimeType.startsWith('image/')) {
		return 'image';
	}
	if (mimeType === 'application/pdf') {
		return 'pdf';
	}
	if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
		return 'docx';
	}
	if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
		return 'xlsx';
	}
	return 'unknown';
}

/**
 * Определяет количество страниц в PDF файле
 */
async function getPDFPageCount(buffer: Buffer): Promise<number> {
	try {
		// Конвертируем Buffer в Uint8Array для PDF-LIB
		const uint8Array = new Uint8Array(buffer);
		
		// Загружаем PDF документ
		const pdfDoc = await PDFDocument.load(uint8Array);
		
		// Получаем количество страниц
		const pages = pdfDoc.getPages();
		return pages.length;
	} catch (error) {
		// Если не удалось определить, возвращаем 1 (предполагаем одностраничный)
		logger.warn('Не удалось определить количество страниц PDF', {
			error: error instanceof Error ? error.message : String(error)
		});
		return 1;
	}
}

/**
 * Получает полную информацию о файле заявки
 *
 * Возвращает все необходимые данные о файле в одном месте:
 * - buffer, filename, mimeType, fileType, pageCount, size
 * - extractedText (если есть завершенная OCR операция)
 *
 * @param applicationId - GUID заявки
 * @returns Информация о файле или null, если файл не найден
 */
export async function getFileInfo(applicationId: string): Promise<{
	buffer: Buffer;
	filename: string;
	mimeType: string;
	fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown';
	pageCount: number;
	size: number;
	extractedText?: string;
} | null> {
	const fileData = getApplicationFile(applicationId);
	if (!fileData) {
		return null;
	}

	const { buffer, filename } = fileData;
	const mimeType = getMimeTypeFromFilename(filename);
	const fileType = getFileType(mimeType);

	// Получаем размер файла
	const filePath = getApplicationFilePath(applicationId);
	const stats = filePath ? statSync(filePath) : null;
	const size = stats?.size || buffer.length;

	// Определяем количество страниц
	let pageCount = 1;
	if (fileType === 'pdf') {
		pageCount = await getPDFPageCount(buffer);
	}

	// Проверяем существующую OCR операцию для получения текста
	let extractedText: string | undefined;
	const ocrOperation = getOperationByApplicationAndTypeWithSync(applicationId, 'ocr');
	if (
		ocrOperation &&
		ocrOperation.status === 'completed' &&
		ocrOperation.result
	) {
		const result = ocrOperation.result as { text?: string };
		if (result.text) {
			extractedText = result.text;
		}
	}

	return {
		buffer,
		filename,
		mimeType,
		fileType,
		pageCount,
		size,
		extractedText
	};
}
