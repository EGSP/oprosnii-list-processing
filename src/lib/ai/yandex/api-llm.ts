/**
 * Модуль Yandex LLM
 *
 * Функции для работы с YandexGPT API:
 * - Отправка запросов в YandexGPT через REST API
 * - Structured output через Zod схемы
 * - Настройка параметров модели (temperature, maxTokens и т.д.)
 */

import { z } from 'zod';
import { fetchStable } from '$lib/utils/fetchStable';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';

const COMPLETION_ENDPOINT = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

export class YandexLLMAPIError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'YandexLLMAPIError';
	}
}

// ============================================================================
// Zod схемы для запроса completion
// ============================================================================

/**
 * Схема для режима рассуждения
 */
export const ReasoningModeSchema = z.enum([
	'REASONING_MODE_UNSPECIFIED',
	'DISABLED',
	'ENABLED_HIDDEN'
]);

/**
 * Схема для опций рассуждения
 */
export const ReasoningOptionsSchema = z.object({
	mode: ReasoningModeSchema
});

/**
 * Схема для опций завершения
 */
export const CompletionOptionsSchema = z.object({
	stream: z.boolean().optional(),
	temperature: z.number().min(0).max(1).optional(),
	maxTokens: z.string().optional(),
	reasoningOptions: ReasoningOptionsSchema.optional()
});

/**
 * Схема для вызова функции
 */
export const FunctionCallSchema = z.object({
	name: z.string(),
	arguments: z.string() // JSON строка
});

/**
 * Схема для вызова инструмента
 */
export const ToolCallSchema = z.object({
	functionCall: FunctionCallSchema
});

/**
 * Схема для списка вызовов инструментов
 */
export const ToolCallListSchema = z.array(ToolCallSchema);

/**
 * Схема для результата функции
 */
export const FunctionResultSchema = z.object({
	name: z.string(),
	result: z.string() // JSON строка
});

/**
 * Схема для результата инструмента
 */
export const ToolResultSchema = z.object({
	functionResult: FunctionResultSchema
});

/**
 * Схема для списка результатов инструментов
 */
export const ToolResultListSchema = z.array(ToolResultSchema);

/**
 * Схема для роли сообщения
 */
export const MessageRoleSchema = z.enum(['system', 'user', 'assistant']);

/**
 * Схема для сообщения в диалоге
 */
export const MessageSchema = z.object({
	role: MessageRoleSchema,
	text: z.string().optional(),
	toolCallList: ToolCallListSchema.optional(),
	toolResultList: ToolResultListSchema.optional()
});

/**
 * Схема для инструмента функции
 */
export const FunctionToolSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	parameters: z.record(z.string(), z.unknown()).optional(),
	strict: z.boolean().optional()
});

/**
 * Схема для инструмента
 */
export const ToolSchema = z.object({
	functionTool: FunctionToolSchema
});

/**
 * Схема для выбора инструмента
 */
export const ToolChoiceSchema = z.union([
	z.enum(['TOOL_CHOICE_UNSPECIFIED', 'NONE', 'AUTO', 'ANY']),
	z.object({
		functionName: z.string()
	})
]);

/**
 * Схема для запроса completion
 */
export const CompletionRequestSchema = z.object({
	modelUri: z.string(),
	completionOptions: CompletionOptionsSchema.optional(),
	messages: z.array(MessageSchema),
	tools: z.array(ToolSchema).optional(),
	toolChoice: ToolChoiceSchema.optional(),
	jsonObject: z.boolean().optional(),
	jsonSchema: z.record(z.string(), z.unknown()).optional(),
	parallelToolCalls: z.boolean().optional()
});

// ============================================================================
// Zod схемы для ответа completion
// ============================================================================

/**
 * Схема для деталей токенов completion
 */
export const CompletionTokensDetailsSchema = z.object({
	completionTokens: z.string(),
	reasoningTokens: z.string().optional(),
	totalTokens: z.string()
});

/**
 * Схема для статистики использования контента
 */
export const ContentUsageSchema = z.object({
	inputTextTokens: z.string(),
	completionTokens: z.string(),
	totalTokens: z.string()
});

/**
 * Схема для статистики использования токенов
 * Может быть либо ContentUsage, либо CompletionTokensDetails
 */
export const UsageSchema = z.union([
	ContentUsageSchema,
	CompletionTokensDetailsSchema
]);

/**
 * Схема для альтернативного ответа
 */
export const AlternativeSchema = z.object({
	message: MessageSchema,
	status: z.string().optional()
});

/**
 * Схема для результата completion
 */
export const CompletionResultSchema = z.object({
	alternatives: z.array(AlternativeSchema),
	usage: UsageSchema,
	modelVersion: z.string()
});

/**
 * Схема для ответа completion
 */
export const CompletionResponseSchema = z.object({
	result: CompletionResultSchema
});

// ============================================================================
// TypeScript типы (выведенные из Zod схем)
// ============================================================================

export type ReasoningMode = z.infer<typeof ReasoningModeSchema>;
export type ReasoningOptions = z.infer<typeof ReasoningOptionsSchema>;
export type CompletionOptions = z.infer<typeof CompletionOptionsSchema>;
export type FunctionCall = z.infer<typeof FunctionCallSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolCallList = z.infer<typeof ToolCallListSchema>;
export type FunctionResult = z.infer<typeof FunctionResultSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type ToolResultList = z.infer<typeof ToolResultListSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type FunctionTool = z.infer<typeof FunctionToolSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ToolChoice = z.infer<typeof ToolChoiceSchema>;
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;
export type CompletionTokensDetails = z.infer<typeof CompletionTokensDetailsSchema>;
export type ContentUsage = z.infer<typeof ContentUsageSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type CompletionResult = z.infer<typeof CompletionResultSchema>;
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;


/**
 * Получение URI модели
 * @param catalogId - ID каталога
 * @param model - Модель
 * @returns URI модели
 */
export function getModelUri(catalogId: string, model: 'yandexgpt-lite' | 'yandexgpt/latest') {
	return `gpt://${catalogId}/${model}`;
}

/**
 * Выполнение запроса completion
 * @param apiKey - API ключ
 * @param request - Запрос completion
 * @returns Результат выполнения запроса
 */
export function completion(apiKey: string, request: CompletionRequest): ResultAsync<CompletionResult, YandexLLMAPIError> {
	return fetchStable(COMPLETION_ENDPOINT, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(request)
	}).andThen((response) => {
		return ResultAsync.fromSafePromise(response.json())
	}).andThen((data) => {
		const result = CompletionResultSchema.safeParse(data?.result);
		if (!result.success) {
			return errAsync(new YandexLLMAPIError(`Invalid response from Yandex GPT ${JSON.stringify(data)}\n
			${JSON.stringify(data?.error?.details)}\n
			${data?.error?.httpStatus}\n
			${data?.error?.message}`, result.error));
			
		}
		return okAsync(result.data);
	});
}