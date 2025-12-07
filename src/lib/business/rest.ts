/**
 * API клиент для работы с заявками и техническими условиями
 */

import type {
	Application,
	ApplicationFilters
} from '$lib/business/types.js';
import type { CreateApplicationResponse } from '$lib/api/types.js';
import { Result, ok, err } from 'neverthrow';
import { fetchStable } from '$lib/utils/fetchStable.js';

/**
 * Базовый URL для API (в SvelteKit это относительные пути)
 */
const API_BASE = '/api';

/**
 * Обертка над fetchStable для работы с JSON API
 * Обрабатывает сетевые ошибки, проверяет HTTP статус и парсит JSON
 */
async function fetchStableJson<T>(url: string, options: RequestInit = {}): Promise<Result<T, Error>> {
	const responseResult = await fetchStable(url, options);

	if (responseResult.isErr()) {
		return err(responseResult.error);
	}

	const response = responseResult.value;
	if (!response.ok) {
		const error: { error?: string } = await response.json().catch(() => ({
			error: `HTTP ${response.status}: ${response.statusText}`
		}));
		return err(new Error(error.error || `HTTP ${response.status}: ${response.statusText}`));
	}

	const data = await response.json();
	return ok(data as T);
}

/**
 * Загрузка файла заявки
 */
export async function uploadApplication(file: File): Promise<Result<CreateApplicationResponse, Error>> {
	const formData = new FormData();
	formData.append('file', file);

	return fetchStableJson<CreateApplicationResponse>(`${API_BASE}/applications`, {
		method: 'POST',
		body: formData
	});
}

/**
 * Получение списка заявок
 */
export async function getApplications(filters?: ApplicationFilters): Promise<Result<Application[], Error>> {
	const params = new URLSearchParams();
	if (filters?.startDate) {
		params.append('startDate', filters.startDate.toISOString());
	}
	if (filters?.endDate) {
		params.append('endDate', filters.endDate.toISOString());
	}
	if (filters?.productType) {
		params.append('productType', filters.productType);
	}

	const url = `${API_BASE}/applications${params.toString() ? `?${params.toString()}` : ''}`;
	return fetchStableJson<Application[]>(url);
}

/**
 * Получение деталей заявки
 */
export async function getApplication(id: string): Promise<Result<Application, Error>> {
	return fetchStableJson<Application>(`${API_BASE}/applications/${id}`);
}

/**
 * Получение списка технических условий
 */
export async function getTechnicalSpecs(): Promise<Result<unknown[], Error>> {
	return fetchStableJson<unknown[]>(`${API_BASE}/technical-specs`);
}

/**
 * Определение типа изделия
 */
export async function detectProductType(id: string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/detect-product-type`, {
		method: 'POST'
	});
}

/**
 * Формирование аббревиатуры продукции
 */
export async function generateAbbreviation(id: string, technicalSpecId: string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/generate-abbreviation`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ technicalSpecId })
	});
}

/**
 * Полная обработка заявки: определение типа + формирование аббревиатуры
 */
export async function processApplication(id: string, technicalSpecId: string): Promise<Result<void, Error>> {
	// Сначала определяем тип изделия
	const detectResult = await detectProductType(id);
	if (detectResult.isErr()) {
		return err(detectResult.error);
	}

	// Затем формируем аббревиатуру
	const generateResult = await generateAbbreviation(id, technicalSpecId);
	if (generateResult.isErr()) {
		return err(generateResult.error);
	}

	return ok(undefined);
}

/**
 * Получение списка операций для заявки
 */
export async function getOperations(id: string): Promise<Result<import('$lib/business/types.js').ProcessingOperation[], Error>> {
	return fetchStableJson<import('$lib/business/types.js').ProcessingOperation[]>(`${API_BASE}/applications/${id}/operations`);
}

/**
 * Тип информации о файле (без buffer)
 */
export interface FileInfo {
	filename: string;
	mimeType: string;
	fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown';
	pageCount: number;
	size: number;
	extractedText?: string;
}

/**
 * Получение информации о файле заявки
 */
export async function getFileInfo(id: string): Promise<Result<FileInfo, Error>> {
	return fetchStableJson<FileInfo>(`${API_BASE}/applications/${id}/file-info`);
}
