import z from "zod";

const GET_OPERATION_ENDPOINT = (operationId: string) => `https://operation.api.cloud.yandex.net/operations/${operationId}`;
const CANCEL_OPERATION_ENDPOINT = (operationId: string) => `https://operation.api.cloud.yandex.net/operations/${operationId}:cancel`;


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
	metadata: z.record(z.unknown()),
	error: YandexCloudOperationErrorSchema.optional(),
	response: z.record(z.unknown()).optional()
}).refine(
	data =>
		(!data.error && !data.response) || // либо их вообще нет (Operation не завершена)
		(Boolean(data.done) && (Boolean(data.error) !== Boolean(data.response))), // либо done==true и только одно из них установлено
	{
		message: 'Если операция завершена (done==true), должно быть задано только одно из полей: error или response'
	}
);



