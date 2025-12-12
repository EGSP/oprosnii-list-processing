/**
 * API клиент для работы с заявками и техническими условиями
 */

import type {
	Application,
	ApplicationFilters,
	ApplicationStatusInfo,
	ProcessingOperation
} from '$lib/business/types.js';
import type { CreateApplicationResponse } from '$lib/api/types.js';
import { Result, ok, err } from 'neverthrow';
import { fetchStable } from '$lib/utils/fetchStable.js';
import type { FileInfo } from '$lib/storage/files';

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

export async function fetchApplication(id:string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}`, {
		method: 'PATCH'
	});
}

/**
 * Получение списка технических условий
 */
export async function getTechnicalSpecs(): Promise<Result<unknown[], Error>> {
	return fetchStableJson<unknown[]>(`${API_BASE}/technical-specs`);
}

/**
 * Извлечение текста из файла заявки
 */
export async function extractText(id: string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/extract-text`, {
		method: 'POST'
	});
}

/**
 * Определение типа изделия
 */
export async function resolveProductType(id: string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/resolve-product-type`, {
		method: 'POST'
	});
}

/**
 * Формирование аббревиатуры продукции
 */
export async function resolveAbbreviation(id: string, technicalSpecId: string): Promise<Result<void, Error>> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/resolve-abbreviation`, {
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
	const resolveResult = await resolveProductType(id);
	if (resolveResult.isErr()) {
		return err(resolveResult.error);
	}

	// Затем формируем аббревиатуру
	const abbreviationResult = await resolveAbbreviation(id, technicalSpecId);
	if (abbreviationResult.isErr()) {
		return err(abbreviationResult.error);
	}

	return ok(undefined);
}

/**
 * Получение списка операций для заявки
 */
export async function getOperations(id: string): Promise<Result<string[], Error>> {
	return fetchStableJson<string[]>(`${API_BASE}/applications/${id}/operations`);
}

/**
 * Получение операции для заявки
 */
export async function getOperation(id: string, operationId: string): Promise<Result<ProcessingOperation, Error>> {
	return fetchStableJson<ProcessingOperation>(`${API_BASE}/applications/${id}/operations/${operationId}`);
}

/**
 * Получение информации о файле заявки
 */
export async function getFileInfo(id: string): Promise<Result<FileInfo, Error>> {
	return fetchStableJson<FileInfo>(`${API_BASE}/applications/${id}/file-info`);
}

/**
 * Получение информации о статусе обработки заявки
 */
export async function getApplicationStatusInfo(id: string): Promise<Result<ApplicationStatusInfo, Error>> {
	const applicationResult = await getApplication(id);
	if (applicationResult.isErr()) {
		return err(applicationResult.error);
	}

	const operationsResult = await getOperations(id);
	if (operationsResult.isErr()) {
		return err(operationsResult.error);
	}

	let status = 'nothing';
	let operations: ProcessingOperation[] = [];
	if (operationsResult.value.length > 0) {
		let completedOperations = 0;
		for (const operationId of operationsResult.value) {
			const operationResult = await getOperation(id, operationId);
			if (operationResult.isErr()) {
				return err(operationResult.error);
			}
			const operation = operationResult.value;
			if (operation.status === 'completed') {
				completedOperations++;
			}
			operations.push(operation);
		}
		if (completedOperations === operationsResult.value.length) {
			status = 'completed';
		}else{
			status = 'processing';
		}
	}
	return ok({
		application: applicationResult.value,
		status: status as ApplicationStatusInfo['status'],
		operations: operations
	});
}