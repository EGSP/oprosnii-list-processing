import { z } from "zod";
import { fetchStable } from "../../utils/fetchStable.js";
import { Result, ok, err } from "neverthrow";

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
export async function getYandexCloudOperation(
	operationId: string,
	apiKey: string
): Promise<Result<YandexCloudOperation, YandexCloudOperationAPIError>> {
	const responseResult = await fetchStable(
		GET_OPERATION_ENDPOINT(operationId),
		{
			method: "GET",
			headers: {
				Authorization: `Api-Key ${apiKey}`
			}
		},
		30000, // timeout: 30 секунд
		2 // maxRetries: 2 попытки при сетевых ошибках
	);

	if (responseResult.isErr()) {
		return err(
			new YandexCloudOperationAPIError(
				`Не удалось выполнить запрос к Operation API: ${responseResult.error.message}`,
				responseResult.error
			)
		);
	}

	const response = responseResult.value;

	if (!response.ok) {
		let errorMessage = `Operation API вернул ошибку: ${response.status} ${response.statusText}`;
		try {
			const errorBody = await response.json();
			errorMessage += `. ${JSON.stringify(errorBody)}`;
		} catch {
			// Игнорируем ошибку парсинга тела ответа
		}
		return err(new YandexCloudOperationAPIError(errorMessage));
	}

	let result: unknown;
	try {
		result = await response.json();
	} catch (error) {
		return err(
			new YandexCloudOperationAPIError(
				"Не удалось разобрать JSON ответ от Operation API",
				error as Error
			)
		);
	}

	try {
		const operation = YandexCloudOperationSchema.parse(result);
		return ok(operation);
	} catch (error) {
		return err(
			new YandexCloudOperationAPIError(
				"Не удалось валидировать ответ Operation API как YandexCloudOperation",
				error as Error
			)
		);
	}
}

/**
 * Отменяет операцию Yandex Cloud по её ID
 *
 * @param operationId - ID операции для отмены
 * @param apiKey - API ключ Yandex Cloud
 * @returns Result с YandexCloudOperation при успехе или Error при ошибке
 */
export async function cancelYandexCloudOperation(
	operationId: string,
	apiKey: string
): Promise<Result<YandexCloudOperation, YandexCloudOperationAPIError>> {
	const responseResult = await fetchStable(
		CANCEL_OPERATION_ENDPOINT(operationId),
		{
			method: "POST",
			headers: {
				Authorization: `Api-Key ${apiKey}`,
				"Content-Type": "application/json"
			}
		},
		30000, // timeout: 30 секунд
		2 // maxRetries: 2 попытки при сетевых ошибках
	);

	if (responseResult.isErr()) {
		return err(
			new YandexCloudOperationAPIError(
				`Не удалось выполнить запрос к Operation API: ${responseResult.error.message}`,
				responseResult.error
			)
		);
	}

	const response = responseResult.value;

	if (!response.ok) {
		let errorMessage = `Operation API вернул ошибку: ${response.status} ${response.statusText}`;
		try {
			const errorBody = await response.json();
			errorMessage += `. ${JSON.stringify(errorBody)}`;
		} catch {
			// Игнорируем ошибку парсинга тела ответа
		}
		return err(new YandexCloudOperationAPIError(errorMessage));
	}

	let result: unknown;
	try {
		result = await response.json();
	} catch (error) {
		return err(
			new YandexCloudOperationAPIError(
				"Не удалось разобрать JSON ответ от Operation API",
				error as Error
			)
		);
	}

	try {
		const operation = YandexCloudOperationSchema.parse(result);
		return ok(operation);
	} catch (error) {
		return err(
			new YandexCloudOperationAPIError(
				"Не удалось валидировать ответ Operation API как YandexCloudOperation",
				error as Error
			)
		);
	}
}
