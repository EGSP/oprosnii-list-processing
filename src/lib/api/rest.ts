/**
 * API клиент для работы с заявками и техническими условиями
 */

import type {
	Application
} from '$lib/business/types.js';
import type { CreateApplicationResponse } from '$lib/api/types.js';
import { Effect } from 'effect';
import { fetchJson } from '$lib/utils/fetchStable.js';
import type { ApplicationGetProperties } from '$lib/storage/applications';

/**
 * Базовый URL для API (в SvelteKit это относительные пути)
 */
const API_BASE = '/api';


export const REST = {
	Applications: {
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
}