/**
 * Классы ошибок для системы хранения
 */

export class StorageError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'StorageError';
	}
}

export class ApplicationNotFoundError extends StorageError {
	constructor(guid: string) {
		super(`Application with GUID ${guid} not found`);
		this.name = 'ApplicationNotFoundError';
	}
}

export class TechnicalSpecNotFoundError extends StorageError {
	constructor(id: string) {
		super(`Technical specification with ID ${id} not found`);
		this.name = 'TechnicalSpecNotFoundError';
	}
}

export class ValidationError extends StorageError {
	constructor(
		message: string,
		public details?: unknown
	) {
		super(`Validation error: ${message}`);
		this.name = 'ValidationError';
	}
}

export class FileStorageError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(`File storage error: ${message}`, cause);
		this.name = 'FileStorageError';
	}
}

export class OperationNotFoundError extends StorageError {
	constructor(id: string) {
		super(`Processing operation with ID ${id} not found`);
		this.name = 'OperationNotFoundError';
	}
}

export class OperationAlreadyExistsError extends StorageError {
	constructor(applicationId: string, type: string) {
		super(`Processing operation with type ${type} already exists for application ${applicationId}`);
		this.name = 'OperationAlreadyExistsError';
	}
}
