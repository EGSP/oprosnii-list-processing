/**
 * Модуль LLM для работы с различными провайдерами
 *
 * Поддерживает:
 * - YandexGPT через REST API (через yandex/llm.ts)
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import type { Abbreviation, ProcessingOperation, ProductType } from "$lib/business/types";
import { getApplication, ProductTypeSchema, readInstructionByNameAndType, updateApplication } from "$lib/storage";
import { Effect } from "effect";
import { aiConfig } from "./config";
import { completion, getModelUri, type CompletionRequest, type CompletionResult } from "./yandex/api-llm";
import z from "zod";
import { parseZodSchema } from "$lib/utils/zod.js";




export function getProductTypeResolveData(processingOperation: ProcessingOperation): Effect.Effect<unknown, Error> {
	return Effect.gen(function* () {
		if (processingOperation.status !== 'completed') {
			return yield* Effect.fail(new Error('Операция не завершена'));
		}

		const service = processingOperation.data.service;
		if (!service) {
			return yield* Effect.fail(new Error('Не указан сервис'));
		}

		switch (service) {
			case 'yandex':
				return yield* getYandexLLMData(processingOperation.data as { service: string;[key: string]: unknown });
			default:
				return yield* Effect.fail(new Error('Неизвестный сервис'));
		}
	});
}

function getYandexLLMData(data: { service: string;[key: string]: unknown }): Effect.Effect<unknown, Error> {
	if (!data.service || data.service !== 'yandex') {
		return Effect.fail(new Error('Неверный сервис'));
	}

	return Effect.succeed(data.data);
}

function getSystemMessage(instruction: string): string {
	return `
		Ты являешься помощником для определения типа продукции на основе текста заявки.
		Ты должен определить тип продукции на основе текста заявки.
		Ты должен вернуть тип продукции в формате JSON.
		Инструкция по определению типа продукции:
		${instruction}`
}


function getParsedCompletionText<T extends z.ZodType>(completionResult: CompletionResult, schema: T):
	Effect.Effect<z.infer<T>, Error> {
	return Effect.gen(function* () {
		const llmText = completionResult.alternatives[0].message.text;
		if (!llmText) {
			return yield* Effect.fail(new Error('Не указан текст ответа LLM'));
		}

		const objectFromJson = yield* Effect.try({
			try: () => JSON.parse(llmText),
			catch: (error) => error as Error
		});

		const parsedData = yield* parseZodSchema(objectFromJson, schema);
		return parsedData;
	});
}

export function resolveProductType(applicationId: string, text: string): Effect.Effect<ProductType, Error> {
	return Effect.gen(function* () {
		const config = aiConfig.yandexGPT;
		const instruction = yield* readInstructionByNameAndType('Определение типа продукции', 'product-type');

		const completionRequest: CompletionRequest = {
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
			jsonSchema: { schema: z.toJSONSchema(ProductTypeSchema, {}) }
		};

		const completionResult = yield* completion(config.apiKey, completionRequest);
		const productType = yield* getParsedCompletionText(completionResult, ProductTypeSchema);
		
		return productType;
	});
}

export function fetchLLMOperation(processingOperation: ProcessingOperation): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		if (processingOperation.status !== 'completed') {
			return yield* Effect.fail(new Error('Операция должна быть завершена. Асинхронные операции не поддерживаются.'));
		}

		if (processingOperation.data.service === 'yandex') {
			if (processingOperation.task === 'resolveProductType') {
				const application = yield* getApplication(processingOperation.applicationId);
				yield* updateApplication(
					application.id,
					{ productType: processingOperation.data.productType as ProductType }
				);
				return;
			} else if (processingOperation.task === 'resolveAbbreviation') {
				const application = yield* getApplication(processingOperation.applicationId);
				yield* updateApplication(
					application.id,
					{ abbreviation: processingOperation.data.abbreviation as Abbreviation }
				);
				return;
			} else {
				return yield* Effect.fail(new Error('Неизвестная задача'));
			}
		} else {
			return yield* Effect.fail(
				new Error(
					`Неизвестный сервис: ${JSON.stringify(processingOperation, null, 2)}`
				)
			);
		}
	});
}

