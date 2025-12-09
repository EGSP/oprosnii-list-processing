/**
 * Модуль LLM для работы с различными провайдерами
 *
 * Поддерживает:
 * - YandexGPT через REST API (через yandex/llm.ts)
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import type { ProcessingOperation, ProductType } from "$lib/business/types";
import { ProductTypeSchema, readInstructionByNameAndType } from "$lib/storage";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { aiConfig } from "./config";
import { completion, getModelUri, type CompletionRequest } from "./yandex/api-llm";
import z from "zod";


export class LLMError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'LLMError';
	}
}


export function getProductTypeResolveData(processingOperation: ProcessingOperation): Result<unknown, Error> {
	if (processingOperation.status !== 'completed')
		return err(new LLMError('Операция не завершена'));

	const service = processingOperation.data.service;
	if (!service)
		return err(new LLMError('Не указан сервис'));

	switch (service) {
		case 'yandex':
			return getYandexLLMData(processingOperation.data as { service: string;[key: string]: unknown });
		default:
			return err(new LLMError('Неизвестный сервис'));
	}
}

function getYandexLLMData(data: { service: string;[key: string]: unknown }): Result<unknown, Error> {
	if (!data.service || data.service !== 'yandex')
		return err(new LLMError('Неверный сервис'));

	return ok(data.data);
}

function getSystemMessage(instruction: string): string {
	return `
		Ты являешься помощником для определения типа продукции на основе текста заявки.
		Ты должен определить тип продукции на основе текста заявки.
		Ты должен вернуть тип продукции в формате JSON.
		Инструкция по определению типа продукции:
		${instruction}`
}

export function resolveProductType(applicationId: string, text: string): ResultAsync<ProductType, Error> {
	const config = aiConfig.yandexGPT;
	return readInstructionByNameAndType('Определение типа продукции', 'product-type')
		.andThen((instruction) => {
			return ok<CompletionRequest>({
				modelUri: getModelUri(config.folderId!, 'yandexgpt-lite'),
				messages: [
					{
						role: 'system',
						text: getSystemMessage(JSON.stringify(instruction))
					},
					{
						role: 'user',
						text: text
					}
				],
				jsonSchema: { schema: z.toJSONSchema(ProductTypeSchema) }
			});
		})
		.asyncAndThen((completionRequest) => {
			return completion(config.apiKey, completionRequest);
		})
		.andThen((completionResult) => {
			const llmText = completionResult.alternatives[0].message.text;
			const productTypeResult = ProductTypeSchema.safeParse(llmText);
			if (!productTypeResult.success)
				return err(new LLMError('Не удалось прочитать ответ LLM:\n' + llmText));
			return ok(productTypeResult.data);
		})
		;
}

