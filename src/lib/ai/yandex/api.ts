import { z } from "zod";
import { fetchStable } from "../../utils/fetchStable.js";
import { Effect } from "effect";
import { parseZodSchema } from "../../utils/zod.js";

const GET_OPERATION_ENDPOINT = (operationId: string) => `https://operation.api.cloud.yandex.net/operations/${operationId}`;
const CANCEL_OPERATION_ENDPOINT = (operationId: string) => `https://operation.api.cloud.yandex.net/operations/${operationId}:cancel`;

export class YandexCloudOperationAPIError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = "YandexCloudOperationAPIError";
	}
}

/**
 * Тип описания ошибки операции Yandex Cloud (google.rpc.Status)
 */
export type YandexCloudOperationError = z.infer<typeof YandexCloudOperationErrorSchema>;
export const YandexCloudOperationErrorSchema = z.object({
	code: z.number().int().describe('The error code.'),
	message: z.string().describe('The error message.'),
	details: z.array(z.unknown()).describe('A list of messages that carry the error details.')
});

/**
 * Тип для описания операции Yandex Cloud в соответствии со спецификацией Google Long-Running Operation.
 */
export type YandexCloudOperation = z.infer<typeof YandexCloudOperationSchema>;
export const YandexCloudOperationSchema = z.object({
	id: z.string(),
	description: z.string().max(256),
	createdAt: z.string(),
	createdBy: z.string(),
	modifiedAt: z.string(),
	done: z.boolean(),
	metadata: z.record(z.string(), z.unknown()),
	error: YandexCloudOperationErrorSchema.optional(),
	response: z.record(z.string(), z.unknown()).optional()
}).refine(
	data =>
		(!data.error && !data.response) || // либо их вообще нет (Operation не завершена)
		(Boolean(data.done) && (Boolean(data.error) !== Boolean(data.response))), // либо done==true и только одно из них установлено
	{
		error: 'Если операция завершена (done==true), должно быть задано только одно из полей: error или response'
	}
);

/**
 * Получает информацию об операции Yandex Cloud по её ID
 *
 * @param operationId - ID операции
 * @param apiKey - API ключ Yandex Cloud
 * @returns Result с YandexCloudOperation при успехе или Error при ошибке
 */
export function getYandexCloudOperation(operationId: string, apiKey: string):
	Effect.Effect<YandexCloudOperation, Error> {

	return Effect.gen(function* () {
		const response = yield* fetchStable(GET_OPERATION_ENDPOINT(operationId),
			{
				method: "GET",
				headers: {
					Authorization: `Api-Key ${apiKey}`
				}
			},
			30000, // timeout: 30 секунд
			2 // maxRetries: 2 попытки при сетевых ошибках
		);

		if (!response.ok) {
			yield* Effect.fail(new YandexCloudOperationAPIError(
				`Operation API вернул ошибку: ${response.status} ${response.statusText}`
			));
		}

		let result = yield* Effect.tryPromise({
			try: async () => await response.json(),
			catch: (error) => new YandexCloudOperationAPIError(
				"Не удалось разобрать JSON ответ от Operation API",
				error as Error
			)
		});

		const operation = yield* parseZodSchema(result, YandexCloudOperationSchema);

		return operation;
	});
}


export function cancelYandexCloudOperation(operationId: string, apiKey: string):
	Effect.Effect<YandexCloudOperation, Error> {
	return Effect.gen(function* () {
		const response = yield* fetchStable(CANCEL_OPERATION_ENDPOINT(operationId),
			{
				method: "POST",
				headers: {
					Authorization: `Api-Key ${apiKey}`
				}
			},
			30000, // timeout: 30 секунд
			2 // maxRetries: 2 попытки при сетевых ошибках
		);

		if (!response.ok) {
			yield* Effect.fail(new YandexCloudOperationAPIError(
				`Operation API вернул ошибку: ${response.status} ${response.statusText}`
			));
		}

		let result = yield* Effect.tryPromise({
			try: async () => await response.json(),
			catch: (error) => new YandexCloudOperationAPIError(
				"Не удалось разобрать JSON ответ от Operation API",
				error as Error
			)
		});

		const operation = yield* parseZodSchema(result, YandexCloudOperationSchema);

		return operation as YandexCloudOperation;
	});
}