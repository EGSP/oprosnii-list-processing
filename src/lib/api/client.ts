/**
 * API клиент для работы с заявками и техническими условиями
 */

import type {
	Application,
	ApplicationFilters,
	CreateApplicationResponse,
	TechnicalSpec
} from '$lib/business/types.js';
import type { ApiError } from './types.js';

/**
 * Базовый URL для API (в SvelteKit это относительные пути)
 */
const API_BASE = '/api';

/**
 * Обработка ошибок API
 */
async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error: ApiError = await response.json().catch(() => ({
			error: `HTTP ${response.status}: ${response.statusText}`
		}));
		throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Загрузка файла заявки
 */
export async function uploadApplication(file: File): Promise<CreateApplicationResponse> {
	const formData = new FormData();
	formData.append('file', file);

	const response = await fetch(`${API_BASE}/applications`, {
		method: 'POST',
		body: formData
	});

	return handleResponse<CreateApplicationResponse>(response);
}

/**
 * Получение списка заявок
 */
export async function getApplications(filters?: ApplicationFilters): Promise<Application[]> {
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
	const response = await fetch(url);
	return handleResponse<Application[]>(response);
}

/**
 * Получение деталей заявки
 */
export async function getApplication(id: string): Promise<Application> {
	const response = await fetch(`${API_BASE}/applications/${id}`);
	return handleResponse<Application>(response);
}

/**
 * Получение списка технических условий
 */
export async function getTechnicalSpecs(): Promise<TechnicalSpec[]> {
	const response = await fetch(`${API_BASE}/technical-specs`);
	return handleResponse<TechnicalSpec[]>(response);
}

/**
 * Определение типа изделия
 */
export async function detectProductType(id: string): Promise<void> {
	const response = await fetch(`${API_BASE}/applications/${id}/detect-product-type`, {
		method: 'POST'
	});
	await handleResponse(response);
}

/**
 * Формирование аббревиатуры продукции
 */
export async function generateAbbreviation(id: string, technicalSpecId: string): Promise<void> {
	const response = await fetch(`${API_BASE}/applications/${id}/generate-abbreviation`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ technicalSpecId })
	});
	await handleResponse(response);
}

/**
 * Полная обработка заявки: определение типа + формирование аббревиатуры
 */
export async function processApplication(id: string, technicalSpecId: string): Promise<void> {
	// Сначала определяем тип изделия
	await detectProductType(id);
	// Затем формируем аббревиатуру
	await generateAbbreviation(id, technicalSpecId);
}

/**
 * Получение списка операций для заявки
 */
export async function getOperations(id: string): Promise<import('$lib/business/types.js').ProcessingOperation[]> {
	const response = await fetch(`${API_BASE}/applications/${id}/operations`);
	return handleResponse<import('$lib/business/types.js').ProcessingOperation[]>(response);
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
export async function getFileInfo(id: string): Promise<FileInfo> {
	const response = await fetch(`${API_BASE}/applications/${id}/file-info`);
	return handleResponse<FileInfo>(response);
}
