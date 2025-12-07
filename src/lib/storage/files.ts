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
import { logger } from '../utils/logger.js';
import { PDFDocument } from 'pdf-lib';
import { findOperations, getOperation } from './processingOperations.js';
import { err, ok, type Result } from 'neverthrow';



export type FileType = 'pdf' | 'docx' | 'xlsx' | 'image' | 'unknown';
/**
 * Тип информации о файле (без buffer)
 */
export type FileInfo = {
	name: string;
	type: FileType;
	extension: string;
	pageCount: number;
	extractedText?: string;
}

/**
 * Сохраняет файл заявки в хранилище
 * @param fileBuffer - Buffer с содержимым файла
 * @param applicationId - GUID заявки
 * @param originalFilename - Оригинальное имя файла (для сохранения расширения)
 * @returns Путь к сохраненному файлу
 */
export function storeFile(
	fileBuffer: Buffer,
	applicationId: string,
	originalFilename: string
): string {
	try {
		// Создаем директорию для заявки
		const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);
		mkdirSync(applicationDir, { recursive: true });

		// Сохраняем оригинальное расширение
		const extension = originalFilename.split('.').pop() || '';
		const filename = `${applicationId}.${extension}`;
		const filePath = join(applicationDir, filename);

		writeFileSync(filePath, fileBuffer);

		return filePath;
	} catch (error) {
		throw new FileStorageError(`Failed to save file for application ${applicationId}`, error as Error);
	}
}

/**
 * Получает путь к файлу заявки. Файл должен иметь GUID в имени. GUID - это ID заявки.
 */
export function getFilePath(applicationId: string): Result<string, Error> {
	const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);

	if (!existsSync(applicationDir)) {
		return err(new Error(`Application directory not found for application ${applicationId}`));
	}

	// Ищем файл в директории заявки
	// Файл может иметь GUID как имя, с любым расширением
	const files = readdirSync(applicationDir);
	const file = files.find((f: string) => f.startsWith(applicationId));

	if (!file) {
		return err(new Error(`File not found for application ${applicationId}. Files: ${files.join(', ')}`));
	}

	return ok(join(applicationDir, file));
}

export function getFileNameWithoutExtension(path: string): string {
	return path.split('.').slice(0, -1).join('.');
}

function getFileType(path: string): FileType {
	const extension = path.split('.').pop()?.toLowerCase();
	if (!extension) {
		return 'unknown';
	}
	switch (extension) {
		case 'pdf':
			return 'pdf';
		case 'docx':
			return 'docx';
		case 'xlsx':
			return 'xlsx';
		case 'jpeg':
			return 'image';
		case 'jpg':
			return 'image';
		case 'png':
			return 'image';
		default:
			return 'unknown';
	}
}

function getFileExtension(path: string): string {
	const extension = path.split('.').pop()?.toLowerCase();
	if (!extension) {
		return '';
	}
	return extension;
}

/**
 * Читает файл заявки
 */
export function readFile(path: string): Result<Buffer, Error> {
	if (!path || !existsSync(path)) {
		return err(new Error(`File not found for path ${path}`));
	}

	const buffer = readFileSync(path);
	return ok(buffer);
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

async function getPageCount(fileType: FileType, buffer: Buffer): Promise<Result<number, Error>> {
	if (fileType === 'pdf') {
		const pageCountResult = await getPDFPageCount(buffer);
		return ok(pageCountResult);
	}
	return ok(1);
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
export async function getFileInfo(applicationId: string): Promise<Result<FileInfo, Error>> {
	const filePathResult = getFilePath(applicationId);
	if (filePathResult.isErr()) {
		return err(filePathResult.error);
	}
	const filePath = filePathResult.value;

	const name = getFileNameWithoutExtension(filePath);

	const fileBufferResult = readFile(filePath);
	if (fileBufferResult.isErr()) {
		return err(fileBufferResult.error);
	}
	const buffer = fileBufferResult.value;

	const type = getFileType(filePath);
	const extension = getFileExtension(filePath);

	// Определяем количество страниц
	const pageCountResult = await getPageCount(type, buffer);
	if (pageCountResult.isErr()) {
		return err(pageCountResult.error);
	}
	const pageCount = pageCountResult.value;

	// Проверяем существующую OCR операцию для получения текста
	let extractedText: string | undefined;
	const textExtractionOperations = findOperations(applicationId, 'extractText');

	if (textExtractionOperations.isOk()) {
		extractedText = textExtractionOperations.value.map((operationId) => {
			const operation = getOperation(operationId);
			if (operation.isOk()) {
				return operation.value.data?.result as string;
			}
			return '';
		}).join('\n');
	}

	return ok({
		name,
		extension,
		type,
		pageCount,
		extractedText
	});
}
