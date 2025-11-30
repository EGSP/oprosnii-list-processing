# Модуль хранилища данных (Storage)

Модуль отвечает за хранение данных приложения: базу данных SQLite для метаданных заявок и файловое хранилище для исходных файлов.

Реализация соответствует требованиям из [`../business/AGENTS.md`](../business/AGENTS.md).

## Структура модуля

Расположение: `src/lib/storage/`

### Файлы

- **`types.ts`** - TypeScript типы и Zod схемы для валидации
- **`db.ts`** - Подключение к SQLite и утилиты для работы с БД
- **`repository.ts`** - Репозиторий для CRUD операций с заявками
- **`operationsRepository.ts`** - Репозиторий для операций обработки (OCR, LLM)
- **`fileStorage.ts`** - Управление файлами заявок
- **`technicalSpecs.ts`** - Управление техническими условиями (ТУ)
- **`errors.ts`** - Классы ошибок для обработки исключений
- **`index.ts`** - Централизованный экспорт всех функций модуля

## База данных

### Схема таблицы `applications`

| Поле                      | Тип              | Описание                                   |
| ------------------------- | ---------------- | ------------------------------------------ |
| `id`                      | TEXT PRIMARY KEY | GUID заявки                                |
| `original_filename`       | TEXT             | Оригинальное имя файла                     |
| `product_type`            | TEXT             | Тип изделия                                |
| `ocr_result`              | TEXT (JSON)      | Результат OCR                              |
| `llm_product_type_result` | TEXT (JSON)      | Результат LLM по определению типа          |
| `llm_abbreviation_result` | TEXT (JSON)      | Результат LLM по формированию аббревиатуры |
| `arrival_date`            | TEXT (DATETIME)  | Дата прихода заявки                        |
| `processing_start_date`   | TEXT (DATETIME)  | Дата начала обработки                      |
| `processing_end_date`     | TEXT (DATETIME)  | Дата завершения обработки                  |

### Расположение БД

Файл базы данных: `data/db/applications.db`

База данных автоматически инициализируется при первом подключении. Используется режим WAL (Write-Ahead Logging) для лучшей производительности.

### Схема таблицы `processing_operations`

| Поле                    | Тип              | Описание                                                    |
| ----------------------- | ---------------- | ----------------------------------------------------------- |
| `id`                    | TEXT PRIMARY KEY | UUID операции                                               |
| `application_id`        | TEXT NOT NULL    | GUID заявки (FK)                                            |
| `type`                  | TEXT NOT NULL    | Тип операции: 'ocr', 'llm_product_type', 'llm_abbreviation' |
| `provider`              | TEXT NOT NULL    | Провайдер сервиса: 'yandex', 'local' и т.д.                 |
| `status`                | TEXT NOT NULL    | Статус: 'pending', 'running', 'completed', 'failed'         |
| `external_operation_id` | TEXT             | ID операции у внешнего сервиса (для асинхронных)            |
| `request_data`          | TEXT (JSON)      | Минимальные данные запроса (endpoint, method)               |
| `result`                | TEXT (JSON)      | Результат операции                                          |
| `error`                 | TEXT (JSON)      | Информация об ошибке                                        |
| `created_at`            | TEXT (DATETIME)  | Дата создания операции                                      |
| `started_at`            | TEXT (DATETIME)  | Дата начала выполнения                                      |
| `completed_at`          | TEXT (DATETIME)  | Дата завершения                                             |
| `progress`              | TEXT (JSON)      | Прогресс выполнения (опционально)                           |
| `retry_count`           | INTEGER          | Количество попыток                                          |
| `max_retries`           | INTEGER          | Максимальное количество попыток                             |

**Ограничения:**

- Уникальный индекс на `(application_id, type)` - одна операция каждого типа на заявку
- Внешний ключ на `applications(id)` с каскадным удалением

## Файловое хранилище

### Структура директорий

- **Загруженные файлы заявок**: `data/uploads/{guid}/`
  - Каждая заявка имеет свою директорию, названную по GUID
  - Файл сохраняется с именем `{guid}.{расширение}`

- **Технические условия**: `data/tu/`
  - JSON файлы с техническими условиями
  - Имя файла: `{id}.json`

## API модуля

### Репозиторий заявок (`repository.ts`)

#### `createApplication(originalFilename: string, guid?: string): Application`

Создает новую заявку в БД с автоматической генерацией GUID.

```typescript
const application = createApplication('document.pdf');
// или с указанным GUID
const application = createApplication('document.pdf', 'custom-guid');
```

#### `getApplication(guid: string): Application | null`

Получает заявку по GUID.

```typescript
const application = getApplication('some-guid');
if (application) {
	console.log(application.originalFilename);
}
```

#### `updateApplication(guid: string, updates: ApplicationUpdate): Application | null`

Обновляет заявку. Возвращает обновленную заявку или `null`, если заявка не найдена.

```typescript
const updated = updateApplication('some-guid', {
	productType: 'Изделие А',
	ocrResult: { text: '...' },
	processingStartDate: new Date().toISOString()
});
```

#### `listApplications(filters?: ApplicationFilters): Application[]`

Получает список заявок с опциональной фильтрацией.

```typescript
// Все заявки
const all = listApplications();

// С фильтрами
const filtered = listApplications({
	startDate: new Date('2024-01-01'),
	endDate: new Date('2024-12-31'),
	productType: 'Изделие А'
});
```

#### `deleteApplication(guid: string): boolean`

Удаляет заявку из БД. Возвращает `true`, если удаление прошло успешно.

### Файловое хранилище (`fileStorage.ts`)

#### `saveApplicationFile(fileBuffer: Buffer, guid: string, originalFilename: string): string`

Сохраняет файл заявки в хранилище. Возвращает путь к сохраненному файлу.

```typescript
const filePath = saveApplicationFile(buffer, 'some-guid', 'document.pdf');
```

#### `getApplicationFile(guid: string): { buffer: Buffer; filename: string } | null`

Читает файл заявки. Возвращает буфер с содержимым и имя файла.

```typescript
const file = getApplicationFile('some-guid');
if (file) {
	console.log(file.filename, file.buffer.length);
}
```

#### `getApplicationFilePath(guid: string): string | null`

Получает путь к файлу заявки без чтения содержимого.

#### `applicationFileExists(guid: string): boolean`

Проверяет существование файла заявки.

#### `deleteApplicationFile(guid: string): boolean`

Удаляет файл заявки из хранилища.

#### `getApplicationFileInfo(guid: string): { size: number; modified: Date } | null`

Получает информацию о файле (размер, дата изменения).

#### `getFileInfo(applicationId: string): Promise<FileInfo | null>`

Получает полную информацию о файле заявки в одном месте. Эта функция объединяет получение буфера, определение MIME типа, количества страниц (для PDF), размера файла и проверку уже извлеченного текста из OCR операции.

**Возвращает:**
```typescript
{
  buffer: Buffer;              // Содержимое файла
  filename: string;            // Имя файла
  mimeType: string;            // MIME тип (определяется по расширению)
  fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown';
  pageCount: number;          // Количество страниц (1 для всех, кроме PDF)
  size: number;                // Размер файла в байтах
  extractedText?: string;     // Уже извлеченный текст (если есть завершенная OCR операция)
}
```

**Пример использования:**
```typescript
const fileInfo = await getFileInfo('some-guid');
if (fileInfo) {
  console.log(`Файл: ${fileInfo.filename}, тип: ${fileInfo.mimeType}, страниц: ${fileInfo.pageCount}`);
  if (fileInfo.extractedText) {
    console.log('Текст уже извлечен:', fileInfo.extractedText.substring(0, 100));
  }
}
```

**Особенности:**
- Для PDF файлов автоматически определяется количество страниц через `pdf-lib` (PDF-LIB)
- Проверяет существующую завершенную OCR операцию и возвращает уже извлеченный текст, если он есть
- Все данные о файле получаются один раз, что оптимизирует работу с файлами

### Управление техническими условиями (`technicalSpecs.ts`)

#### `listTechnicalSpecs(): TechnicalSpec[]`

Получает список всех доступных технических условий из директории `data/tu/`.

```typescript
const specs = listTechnicalSpecs();
specs.forEach((spec) => console.log(spec.name));
```

#### `getTechnicalSpec(id: string): TechnicalSpec | null`

Получает техническое условие по ID.

```typescript
const spec = getTechnicalSpec('example-tu');
if (spec) {
	console.log(spec.abbreviationTemplate);
}
```

#### `saveTechnicalSpec(spec: TechnicalSpec): boolean`

Сохраняет техническое условие в файл. Выбрасывает ошибку при валидации.

```typescript
const success = saveTechnicalSpec({
  id: 'new-spec',
  name: 'Новое ТУ',
  rules: [...],
  abbreviationTemplate: '{param1}-{param2}'
});
```

#### `deleteTechnicalSpec(id: string): boolean`

Удаляет техническое условие.

### Репозиторий операций обработки (`operationsRepository.ts`)

#### `createOrUpdateOperation(applicationId: string, type: ProcessingOperationType, provider: string, requestData: ProcessingOperationRequestData, status?: ProcessingOperationStatus, externalOperationId?: string | null): ProcessingOperation`

Создает новую операцию обработки или обновляет существующую (если операция с таким типом уже есть для заявки).

```typescript
const operation = createOrUpdateOperation(
	'application-id',
	'ocr',
	'yandex',
	{
		endpoint: 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',
		method: 'POST'
	},
	'pending'
);
```

#### `getOperation(id: string): ProcessingOperation | null`

Получает операцию по ID.

```typescript
const operation = getOperation('operation-id');
if (operation) {
	console.log(operation.status);
}
```

#### `getOperationByApplicationAndType(applicationId: string, type: ProcessingOperationType): ProcessingOperation | null`

Получает операцию по ID заявки и типу. Возвращает `null`, если операция не найдена.

```typescript
const ocrOperation = getOperationByApplicationAndType('application-id', 'ocr');
```

#### `getOperationsByApplication(applicationId: string, type?: ProcessingOperationType): ProcessingOperation[]`

Получает список всех операций для заявки с опциональной фильтрацией по типу.

```typescript
// Все операции заявки
const allOperations = getOperationsByApplication('application-id');

// Только OCR операции
const ocrOperations = getOperationsByApplication('application-id', 'ocr');
```

#### `syncOperationToApplication(operation: ProcessingOperation): boolean`

Синхронизирует результат завершенной операции с таблицей `applications`. Обновляет соответствующее поле в заявке на основе типа операции:

- `ocr` → обновляет `ocrResult`
- `llm_product_type` → обновляет `llmProductTypeResult` и `productType`
- `llm_abbreviation` → обновляет `llmAbbreviationResult` и `processingEndDate`

**Важно:** Синхронизация происходит только для завершенных операций (`status === 'completed'`). Обновляется только заявка, связанная с данной операцией.

```typescript
const operation = getOperation('operation-id');
if (operation && operation.status === 'completed') {
	syncOperationToApplication(operation);
}
```

#### `getOperationWithSync(id: string): ProcessingOperation | null`

Получает операцию по ID с автоматической синхронизацией результата с заявкой. Если операция завершена, автоматически обновляет соответствующее поле в таблице `applications`.

```typescript
const operation = getOperationWithSync('operation-id');
// Если операция завершена, результат уже синхронизирован с заявкой
```

#### `getOperationByApplicationAndTypeWithSync(applicationId: string, type: ProcessingOperationType): ProcessingOperation | null`

Получает операцию по ID заявки и типу с автоматической синхронизацией результата с заявкой.

```typescript
const ocrOperation = getOperationByApplicationAndTypeWithSync('application-id', 'ocr');
// Если операция завершена, результат уже синхронизирован с заявкой
```

#### `getOperationsByApplicationWithSync(applicationId: string, type?: ProcessingOperationType): ProcessingOperation[]`

Получает список всех операций для заявки с автоматической синхронизацией результатов завершенных операций с заявкой.

```typescript
// Все операции заявки (завершенные автоматически синхронизируются)
const allOperations = getOperationsByApplicationWithSync('application-id');
```

**Примечание:** Функции с синхронизацией (`*WithSync`) рекомендуется использовать в API эндпоинтах для автоматического обновления таблицы `applications` при получении операций.

#### `updateOperation(id: string, updates: ProcessingOperationUpdate): ProcessingOperation | null`

Обновляет операцию. Автоматически заполняет временные метки при изменении статуса.

```typescript
const updated = updateOperation('operation-id', {
	status: 'completed',
	result: { text: 'Extracted text...' }
});
```

#### `updateOperationStatus(id: string, status: ProcessingOperationStatus, data?: {...}): ProcessingOperation | null`

Обновляет статус операции с автоматическим заполнением временных меток и дополнительных данных.

```typescript
updateOperationStatus('operation-id', 'completed', {
	result: { text: 'Extracted text...' }
});

updateOperationStatus('operation-id', 'failed', {
	error: { message: 'Error message', code: 'ERROR_CODE' }
});
```

### Утилиты БД (`db.ts`)

#### `getDatabase(): Database`

Получает экземпляр подключения к базе данных. Создает БД и таблицы при первом вызове.

#### `closeDatabase(): void`

Закрывает подключение к базе данных (использовать при завершении работы приложения).

#### `rowToApplication(row: any): Application`

Преобразует строку из БД в объект `Application`.

#### `applicationToRow(application: Partial<Application>): any`

Преобразует объект `Application` в формат для записи в БД.

#### `rowToProcessingOperation(row: any): ProcessingOperation`

Преобразует строку из БД в объект `ProcessingOperation`.

#### `processingOperationToRow(operation: Partial<ProcessingOperation>): any`

Преобразует объект `ProcessingOperation` в формат для записи в БД.

## Типы данных

### `Application`

```typescript
interface Application {
	id: string; // UUID
	originalFilename: string;
	productType: string | null;
	ocrResult: Record<string, unknown> | null;
	llmProductTypeResult: Record<string, unknown> | null;
	llmAbbreviationResult: Record<string, unknown> | null;
	arrivalDate: string; // ISO datetime string
	processingStartDate: string | null; // ISO datetime string
	processingEndDate: string | null; // ISO datetime string
}
```

### `TechnicalSpec`

```typescript
interface TechnicalSpec {
	id: string;
	name: string;
	description?: string;
	rules: TechnicalSpecRule[];
	abbreviationTemplate: string;
}

interface TechnicalSpecRule {
	parameter: string;
	code: string;
	description: string;
}
```

### `ApplicationFilters`

```typescript
interface ApplicationFilters {
	startDate?: Date;
	endDate?: Date;
	productType?: string;
}
```

### `ProcessingOperation`

```typescript
interface ProcessingOperation {
	id: string; // UUID
	applicationId: string; // UUID заявки
	type: 'ocr' | 'llm_product_type' | 'llm_abbreviation';
	provider: string; // 'yandex', 'local' и т.д.
	status: 'pending' | 'running' | 'completed' | 'failed';
	externalOperationId?: string | null; // ID операции у внешнего сервиса
	requestData: {
		endpoint: string;
		method: 'GET' | 'POST' | 'PUT' | 'DELETE';
		headers?: Record<string, string>;
		body?: unknown;
	};
	result?: Record<string, unknown> | null;
	error?: {
		message: string;
		code?: string;
		details?: unknown;
	} | null;
	createdAt: string; // ISO datetime
	startedAt?: string | null; // ISO datetime
	completedAt?: string | null; // ISO datetime
	progress?: {
		current: number;
		total: number;
		message?: string;
	} | null;
	retryCount?: number;
	maxRetries?: number;
}
```

## Обработка ошибок

Модуль использует кастомные классы ошибок:

- **`StorageError`** - базовая ошибка хранилища
- **`ApplicationNotFoundError`** - заявка не найдена
- **`TechnicalSpecNotFoundError`** - ТУ не найдено
- **`OperationNotFoundError`** - операция обработки не найдена
- **`ValidationError`** - ошибка валидации данных
- **`FileStorageError`** - ошибка работы с файлами

Все ошибки содержат сообщение и опциональную причину (cause).

```typescript
try {
	const app = getApplication('invalid-guid');
} catch (error) {
	if (error instanceof StorageError) {
		console.error('Storage error:', error.message);
	}
}
```

## Валидация

Все данные валидируются через Zod схемы:

- **`ApplicationSchema`** - валидация заявок
- **`TechnicalSpecSchema`** - валидация технических условий
- **`ProcessingOperationSchema`** - валидация операций обработки

Валидация происходит автоматически при создании и обновлении записей.

## Конфигурация

Настройки хранилища находятся в `../config.ts`:

- `config.dbPath` - путь к файлу БД (по умолчанию: `data/db/applications.db`)
- `config.uploadsDirectory` - директория для загруженных файлов (по умолчанию: `data/uploads`)
- `config.tuDirectory` - директория для технических условий (по умолчанию: `data/tu`)

## Использование

Все функции модуля доступны через централизованный экспорт:

```typescript
import {
	createApplication,
	getApplication,
	saveApplicationFile,
	listTechnicalSpecs,
	createOrUpdateOperation,
	getOperation,
	getOperationWithSync,
	getOperationByApplicationAndTypeWithSync,
	getOperationsByApplication,
	getOperationsByApplicationWithSync,
	syncOperationToApplication,
	StorageError
} from '$lib/storage';
```

## Зависимости

- `better-sqlite3` - драйвер SQLite
- `uuid` - генерация GUID
- `zod` - валидация данных

## Примечания

- База данных и директории для файлов автоматически создаются при первом использовании
- JSON поля в БД хранятся как TEXT и автоматически парсятся при чтении
- Все даты хранятся в формате ISO 8601 (строки)
- При ошибках парсинга JSON из БД возвращается `null` для соответствующего поля
- Операции обработки: одна операция каждого типа на заявку (уникальный индекс)
- При создании операции с существующим типом - обновление, а не создание новой
- Завершенные операции не удаляются (хранится история)
