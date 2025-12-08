/**
 * Модуль LLM для работы с различными провайдерами
 *
 * Поддерживает:
 * - YandexGPT через REST API (через yandex/llm.ts)
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import type { ProcessingOperation } from "$lib/business/types";
import { err, ok, type Result } from "neverthrow";


export class LLMError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'LLMError';
	}
}


export function getProductTypeResolveData(processingOperation: ProcessingOperation): Result<any, Error> {
	if (processingOperation.status !== 'completed')
		return err(new LLMError('Операция не завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return err(new LLMError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return getYandexLLMData(processingOperation.data as { service: string;[key: string]: any });
		default:
			return err(new LLMError('Неизвестный сервис'));
	}
}

function getYandexLLMData(data: { service: string;[key: string]: any }): Result<any, Error> {
	if (!data.service || data.service !== 'yandex')
		return err(new LLMError('Неверный сервис'));

	return ok(data.data);
}