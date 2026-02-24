/**
 * API клиент для работы с заявками и техническими условиями
 */

import type {
	Application,
	ApplicationStatusInfo,
	ProcessingOperation
} from '$lib/business/types.js';
import type { CreateApplicationResponse } from '$lib/api/types.js';
import { Effect } from 'effect';
import { fetchJson, fetchStable } from '$lib/utils/fetchStable.js';
import type { FileInfo } from '$lib/storage/files';
import type { ApplicationGetProperties } from '$lib/storage/applications';

/**
 * Базовый URL для API (в SvelteKit это относительные пути)
 */
const API_BASE = '/api';


export const Applications = {
	upload: (file: File): Effect.Effect<CreateApplicationResponse, Error> => {
		const formData = new FormData();
		formData.append('file', file);
		return fetchJson(`${API_BASE}/applications?method=upload`, {
			method: 'POST',
			body: formData
		});
	},
	get: (properties: ApplicationGetProperties): Effect.Effect<Application[], Error> => {
		return fetchJson(`${API_BASE}/applications?method=get`, {
			method: 'POST',
			body: JSON.stringify(properties)
		});
	}
}

/**
 * Получение деталей заявки
 */
export function getApplication(id: string): Effect.Effect<Application, Error> {
	return fetchStableJson<Application>(`${API_BASE}/applications/${id}`);
}

export function fetchApplication(id: string): Effect.Effect<void, Error> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}`, {
		method: 'PATCH'
	});
}

/**
 * Получение списка технических условий
 */
export function getTechnicalSpecs(): Effect.Effect<unknown[], Error> {
	return fetchStableJson<unknown[]>(`${API_BASE}/technical-specs`);
}

/**
 * Извлечение текста из файла заявки
 */
export function extractText(id: string): Effect.Effect<void, Error> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/extract-text`, {
		method: 'POST'
	});
}

/**
 * Определение типа изделия
 */
export function resolveProductType(id: string): Effect.Effect<void, Error> {
	return fetchStableJson<void>(`${API_BASE}/applications/${id}/resolve-product-type`, {
		method: 'POST'
	});
}

/**
 * Формирование аббревиатуры продукции
 */
export function resolveAbbreviation(id: string, technicalSpecId: string): Effect.Effect<void, Error> {
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
export function processApplication(id: string, technicalSpecId: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		// Сначала определяем тип изделия
		yield* resolveProductType(id);
		// Затем формируем аббревиатуру
		yield* resolveAbbreviation(id, technicalSpecId);
	});
}

/**
 * Получение списка операций для заявки
 */
export function getOperations(id: string): Effect.Effect<string[], Error> {
	return fetchStableJson<string[]>(`${API_BASE}/applications/${id}/operations`);
}

/**
 * Получение операции для заявки
 */
export function getOperation(id: string, operationId: string): Effect.Effect<ProcessingOperation, Error> {
	return fetchStableJson<ProcessingOperation>(`${API_BASE}/applications/${id}/operations/${operationId}`);
}

/**
 * Получение информации о файле заявки
 */
export function getFileInfo(id: string): Effect.Effect<FileInfo, Error> {
	return fetchStableJson<FileInfo>(`${API_BASE}/applications/${id}/file-info`);
}

/**
 * Получение информации о статусе обработки заявки
 */
export function getApplicationStatusInfo(id: string): Effect.Effect<ApplicationStatusInfo, Error> {
	return Effect.gen(function* () {
		const application = yield* getApplication(id);
		const operationIds = yield* getOperations(id);

		let status = 'nothing';
		let operations: ProcessingOperation[] = [];
		if (operationIds.length > 0) {
			let completedOperations = 0;
			for (const operationId of operationIds) {
				const operation = yield* getOperation(id, operationId);
				if (operation.status === 'completed') {
					completedOperations++;
				}
				operations.push(operation);
			}
			if (completedOperations === operationIds.length) {
				status = 'completed';
			} else {
				status = 'processing';
			}
		}
		return {
			application,
			status: status as ApplicationStatusInfo['status'],
			operations: operations
		};
	});
}