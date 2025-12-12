/**
 * Модуль извлечения текста из документов и таблиц
 *
 * Использует библиотеку textract для извлечения текста из различных форматов файлов.
 * Поддерживает форматы документов: docx, doc, rtf
 * Поддерживает форматы таблиц: xls, xlsx, xlsb, xlsm, xltx
 */

import { getFileNameWithExtension, getFilePath, readApplicationFile, type FileInfo } from '$lib/storage/files';
import { Result, ok, err, ResultAsync, errAsync, okAsync } from 'neverthrow';

// Ленивая загрузка textract через динамический импорт (для ESM совместимости)
// @ts-ignore - textract не имеет типов TypeScript
let textractCache: any = null;
async function getTextract() {
	if (!textractCache) {
		// @ts-ignore - textract не имеет типов TypeScript
		textractCache = await import('textract');
	}
	return textractCache;
}

/**
 * Поддерживаемые форматы документов
 */
const SUPPORTED_DOCUMENT_FORMATS = ['docx', 'doc', 'rtf'] as const;

/**
 * Поддерживаемые форматы таблиц
 */
const SUPPORTED_SPREADSHEET_FORMATS = ['xls', 'xlsx', 'xlsb', 'xlsm', 'xltx'] as const;

/**
 * Извлекает текст из документов (docx, doc, rtf)
 *
 * @param buffer - Буфер файла
 * @param filenameWithExtension - Имя файла с расширением (например, "document.docx")
 * @returns Результат извлечения текста в формате Result<string, Error>
 */
export async function extractTextFromDocuments(
	buffer: Buffer,
	filenameWithExtension: string
): Promise<Result<string, Error>> {
	// Извлекаем расширение из имени файла
	const extension = filenameWithExtension.split('.').pop()?.toLowerCase() || '';
	const normalizedExtension = extension.replace(/^\./, '');
	
	if (!SUPPORTED_DOCUMENT_FORMATS.includes(normalizedExtension as typeof SUPPORTED_DOCUMENT_FORMATS[number])) {
		return err(
			new Error(
				`Неподдерживаемый формат документа: ${extension}. Поддерживаются: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`
			)
		);
	}

	return new Promise(async (resolve) => {
		try {
			const textract = await getTextract();
			textract.fromBufferWithName(
				filenameWithExtension,
				buffer,
				(error: Error | null, text: string | undefined) => {
					if (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: `Ошибка при извлечении текста из документа: ${String(error)}`;
						resolve(err(new Error(errorMessage)));
					} else {
						resolve(ok(text || ''));
					}
				}
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: `Ошибка при загрузке textract: ${String(error)}`;
			resolve(err(new Error(errorMessage)));
		}
	});
}

/**
 * Извлекает текст из таблиц (xls, xlsx, xlsb, xlsm, xltx)
 *
 * @param buffer - Буфер файла
 * @param filenameWithExtension - Имя файла с расширением (например, "spreadsheet.xlsx")
 * @returns Результат извлечения текста в формате Result<string, Error>
 */
export async function extractTextFromSpreadsheets(
	buffer: Buffer,
	filenameWithExtension: string
): Promise<Result<string, Error>> {
	// Извлекаем расширение из имени файла
	const extension = filenameWithExtension.split('.').pop()?.toLowerCase() || '';
	const normalizedExtension = extension.replace(/^\./, '');
	
	if (
		!SUPPORTED_SPREADSHEET_FORMATS.includes(
			normalizedExtension as typeof SUPPORTED_SPREADSHEET_FORMATS[number]
		)
	) {
		return err(
			new Error(
				`Неподдерживаемый формат таблицы: ${extension}. Поддерживаются: ${SUPPORTED_SPREADSHEET_FORMATS.join(', ')}`
			)
		);
	}

	return new Promise(async (resolve) => {
		try {
			const textract = await getTextract();
			textract.fromBufferWithName(
				filenameWithExtension,
				buffer,
				(error: Error | null, text: string | undefined) => {
					if (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: `Ошибка при извлечении текста из таблицы: ${String(error)}`;
						resolve(err(new Error(errorMessage)));
					} else {
						resolve(ok(text || ''));
					}
				}
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: `Ошибка при загрузке textract: ${String(error)}`;
			resolve(err(new Error(errorMessage)));
		}
	});
}

/**
 * Извлекает текст из файла заявки
 * @param applicationId - GUID заявки
 * @param fileInfo - Информация о файле
 * @returns Результат извлечения текста в формате Result<string, Error>
 */
export function extractTextFromApplicationFile(applicationId: string, fileInfo: FileInfo): ResultAsync<string, Error> {
	const fileBufferResult = readApplicationFile(applicationId);
	if (fileBufferResult.isErr())
		return errAsync(fileBufferResult.error);
	const fileBuffer = fileBufferResult.value;

	const filePathResult = getFilePath(applicationId);
	if (filePathResult.isErr())
		return errAsync(filePathResult.error);
	const filePath = filePathResult.value;
	const filenameWithExtension = getFileNameWithExtension(filePath);
	
	if (fileInfo.type === 'document') {
		return ResultAsync.fromSafePromise(extractTextFromDocuments(fileBuffer, filenameWithExtension)).andThen((result) => {
			if (result.isErr())
				return errAsync(result.error);
			return okAsync(result.value);
		});
	} else if (fileInfo.type === 'spreadsheet') {
		return ResultAsync.fromSafePromise(extractTextFromSpreadsheets(fileBuffer, filenameWithExtension)).andThen((result) => {
			if (result.isErr())
				return errAsync(result.error);
			return okAsync(result.value);
		});
	}
	return errAsync(new Error('Неподдерживаемый тип файла'));
}

