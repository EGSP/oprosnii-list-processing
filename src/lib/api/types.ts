/**
 * Типы для API ответов
 */

export interface ApiError {
	error: string;
	details?: Record<string, unknown>;
}

export interface ApiSuccess<T> {
	data?: T;
}

/**
 * Ответ API для создания заявки
 */
export interface CreateApplicationResponse {
	id: string;
	originalFilename: string;
	arrivalDate: string;
}

/**
 * Запрос на формирование аббревиатуры
 */
export interface GenerateAbbreviationRequest {
	technicalSpecId: string;
}

/**
 * Валидированная форма данных загрузки файла
 */
export interface FileUploadData {
	file: File;
	filename: string;
	size: number;
	type: string;
}
