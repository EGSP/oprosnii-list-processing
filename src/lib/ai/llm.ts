/**
 * Модуль LLM для работы с различными провайдерами
 *
 * Поддерживает:
 * - YandexGPT через REST API (через yandex/llm.ts)
 * - Structured output через Zod схемы
 * - Настройку параметров модели (temperature, maxTokens и т.д.)
 */

import type { Abbreviation, ProcessingOperation, ProductType } from "$lib/business/types";
import { AbbreviationSchema, getApplication, getOperation, ProductTypeSchema, readInstructionByNameAndType, updateApplication } from "$lib/storage";
import { err, errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import { aiConfig } from "./config";
import { completion, getModelUri, type CompletionRequest, type CompletionResult } from "./yandex/api-llm";
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


function getParsedCompletionText<T extends z.ZodType>(completionResult: CompletionResult, schema: T):
	Result<z.infer<T>, Error> {
	const llmText = completionResult.alternatives[0].message.text;
	if (!llmText)
		return err(new LLMError('Не указан текст ответа LLM'));
	const objectFromJson = JSON.parse(llmText);
	const parsedResult = schema.safeParse(objectFromJson);
	if (!parsedResult.success)
		return err(new LLMError('Не удалось преобразовать ответ LLM в JSON:\n' + llmText));
	return ok(parsedResult.data);
}

export function resolveProductType(applicationId: string, text: string): ResultAsync<ProductType, Error> {
	const config = aiConfig.yandexGPT;
	const stringify = JSON.stringify(text)
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
				jsonSchema: { schema: z.toJSONSchema(ProductTypeSchema, {}) }
			});
		})
		.asyncAndThen((completionRequest) => completion(config.apiKey, completionRequest))
		.andThen((completionResult) => getParsedCompletionText(completionResult, ProductTypeSchema));
}

export function fetchLLMOperation(processingOperation: ProcessingOperation): ResultAsync<void, Error> {
	if (processingOperation.status !== 'completed')
		return errAsync(new LLMError('Операция должна быть завершена. Асинхронные операции не поддерживаются.'));

	if (processingOperation.data.service === 'yandex')
		if (processingOperation.task === 'resolveProductType')
			return getApplication(processingOperation.applicationId)
				.asyncAndThen((application) => updateApplication(
					application.id,
					{ productType: processingOperation.data.productType as ProductType })
					.asyncAndThen(() => okAsync(undefined)));
		else if (processingOperation.task === 'resolveAbbreviation')
			return getApplication(processingOperation.applicationId)
				.asyncAndThen((application) => updateApplication(
					application.id,
					{ abbreviation: processingOperation.data.abbreviation as Abbreviation })
					.asyncAndThen(() => okAsync(undefined)));
		else
			return errAsync(new LLMError('Неизвестная задача'));
	else
		return errAsync(new LLMError('Неизвестный сервис'));
}

