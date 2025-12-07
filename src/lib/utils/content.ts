/**
 * Модуль извлечения текста из документов и таблиц
 *
 * Использует библиотеку textract для извлечения текста из различных форматов файлов.
 * Поддерживает форматы документов: docx, doc, rtf
 * Поддерживает форматы таблиц: xls, xlsx, xlsb, xlsm, xltx
 */

import { Result, ok, err } from 'neverthrow';

// textract не имеет типов TypeScript, используем require
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const textract = require('textract');

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

	return new Promise((resolve) => {
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

	return new Promise((resolve) => {
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
	});
}

