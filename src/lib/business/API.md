# REST API документация

Документация REST API для работы с заявками и техническими условиями.

## Базовый URL

```
/api
```

Все запросы должны содержать заголовок `Content-Type: application/json` (кроме загрузки файлов).

## Заявки (Applications)

### 1. Загрузка файла заявки

**POST** `/api/applications`

Загружает файл заявки и создает новую запись в базе данных.

**Content-Type:** `multipart/form-data`

**Тело запроса:**

- `file` (File) - файл заявки. Поддерживаемые форматы:
  - PDF: `application/pdf`
  - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - PNG, JPEG, JPG: `image/png`, `image/jpeg`, `image/jpg`
- Максимальный размер: 10 MB (по умолчанию, настраивается через `VITE_MAX_FILE_SIZE_MB`)

**Ответ 201 Created:**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440000",
	"originalFilename": "document.pdf",
	"arrivalDate": "2024-01-15T10:30:00.000Z"
}
```

**Ошибки:**

- `400 Bad Request` - неверный формат запроса
- `413 Payload Too Large` - файл превышает максимальный размер
- `415 Unsupported Media Type` - неподдерживаемый тип файла
- `500 Internal Server Error` - ошибка сервера

**Пример запроса:**

```bash
curl -X POST http://localhost:5173/api/applications \
  -F "file=@document.pdf"
```

---

### 2. Список заявок

**GET** `/api/applications`

Получает список всех заявок с опциональной фильтрацией.

**Query параметры:**

- `startDate` (string, опционально) - начальная дата фильтрации (ISO 8601)
- `endDate` (string, опционально) - конечная дата фильтрации (ISO 8601)
- `productType` (string, опционально) - фильтр по типу изделия

**Ответ 200 OK:**

```json
[
	{
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"originalFilename": "document.pdf",
		"productType": null,
		"ocrResult": null,
		"llmProductTypeResult": null,
		"llmAbbreviationResult": null,
		"arrivalDate": "2024-01-15T10:30:00.000Z",
		"processingStartDate": null,
		"processingEndDate": null
	}
]
```

**Пример запроса:**

```bash
curl "http://localhost:5173/api/applications?startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z"
```

---

### 3. Получение заявки

**GET** `/api/applications/:id`

Получает информацию о конкретной заявке по GUID.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Ответ 200 OK:**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440000",
	"originalFilename": "document.pdf",
	"productType": "Изделие А",
	"ocrResult": {
		"text": "Извлеченный текст из документа..."
	},
	"llmProductTypeResult": {
		"type": "Изделие А",
		"confidence": 0.95
	},
	"llmAbbreviationResult": {
		"parameters": {
			"material": "ВД",
			"climate": "У1"
		}
	},
	"arrivalDate": "2024-01-15T10:30:00.000Z",
	"processingStartDate": "2024-01-15T10:31:00.000Z",
	"processingEndDate": "2024-01-15T10:35:00.000Z"
}
```

**Ошибки:**

- `400 Bad Request` - неверный формат UUID
- `404 Not Found` - заявка не найдена

**Пример запроса:**

```bash
curl http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000
```

---

### 4. Получение файла заявки

**GET** `/api/applications/:id/file`

Получает исходный файл заявки.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Ответ 200 OK:**

- Content-Type: определяется автоматически по расширению файла
- Тело: бинарные данные файла

**Ошибки:**

- `400 Bad Request` - неверный формат UUID
- `404 Not Found` - заявка или файл не найдены

**Пример запроса:**

```bash
curl -O http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/file
```

---

### 5. Получение информации о файле заявки

**GET** `/api/applications/:id/file-info`

Получает информацию о файле заявки (без содержимого файла).

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Ответ 200 OK:**

```json
{
	"filename": "document.pdf",
	"mimeType": "application/pdf",
	"fileType": "pdf",
	"pageCount": 5,
	"size": 1048576,
	"extractedText": "Извлеченный текст из документа..."
}
```

**Поля ответа:**

- `filename` (string) - имя файла
- `mimeType` (string) - MIME тип файла
- `fileType` (string) - тип файла: `image`, `pdf`, `docx`, `xlsx`, `unknown`
- `pageCount` (number) - количество страниц (для PDF), для остальных типов всегда 1
- `size` (number) - размер файла в байтах
- `extractedText` (string, опционально) - извлеченный текст из файла (если есть завершенная OCR операция)

**Ошибки:**

- `400 Bad Request` - неверный формат UUID
- `404 Not Found` - заявка или файл не найдены

**Пример запроса:**

```bash
curl http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/file-info
```

---

### 6. Определение типа изделия

**POST** `/api/applications/:id/detect-product-type`

Определяет тип изделия из заявки с использованием OCR и LLM.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Ответ 200 OK (синхронная обработка):**

```json
{
	"type": "Изделие А",
	"confidence": 0.95,
	"reasoning": "Обоснование выбора типа",
	"operations": {
		"ocr": "550e8400-e29b-41d4-a716-446655440001",
		"llm": "550e8400-e29b-41d4-a716-446655440002"
	}
}
```

**Ответ 202 Accepted (асинхронная OCR операция):**

Если OCR операция выполняется асинхронно (например, для многостраничных PDF), возвращается HTTP 202:

```json
{
	"message": "OCR операция выполняется асинхронно",
	"operations": {
		"ocr": "550e8400-e29b-41d4-a716-446655440001",
		"llm": null
	},
	"status": "processing"
}
```

В этом случае клиент должен:
1. Использовать `ocrOperationId` для проверки статуса операции через `/api/applications/:id/operations/:operationId/check`
2. После завершения OCR операции повторить запрос к `/api/applications/:id/detect-product-type` для получения результата

**Ошибки:**

- `400 Bad Request` - неверный формат UUID
- `404 Not Found` - заявка не найдена
- `500 Internal Server Error` - ошибка при обработке

**Примечание:** 
- Поле `operations` содержит ID созданных операций обработки для отслеживания статуса
- Для многостраничных PDF автоматически используется асинхронный endpoint YandexOCR
- UI автоматически проверяет статус операций каждые 3 секунды, если есть операции в статусе "running"

**Статус:** ✅ Реализовано. Использует OCR и LLM сервисы с поддержкой операций обработки и асинхронных операций.

---

### 7. Формирование аббревиатуры

**POST** `/api/applications/:id/generate-abbreviation`

Формирует аббревиатуру продукции на основе параметров из заявки и технических условий.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Тело запроса:**

```json
{
	"technicalSpecId": "example-tu"
}
```

**Ответ 200 OK:**

```json
{
	"parameters": [
		{
			"parameter": "material",
			"value": "Водостойкий",
			"code": "ВД",
			"confidence": 0.9
		}
	],
	"abbreviation": "ВД-У1-100",
	"operations": {
		"ocr": "550e8400-e29b-41d4-a716-446655440001",
		"llm": "550e8400-e29b-41d4-a716-446655440003"
	}
}
```

**Ошибки:**

- `400 Bad Request` - неверный формат UUID или отсутствует technicalSpecId
- `404 Not Found` - заявка или техническое условие не найдены
- `500 Internal Server Error` - ошибка при обработке

**Примечание:** Поле `operations` содержит ID созданных операций обработки для отслеживания статуса.

**Статус:** ✅ Реализовано. Использует LLM сервис с поддержкой операций обработки.

---

## Технические условия (Technical Specifications)

### 8. Список технических условий

**GET** `/api/technical-specs`

Получает список всех доступных технических условий.

**Ответ 200 OK:**

```json
[
	{
		"id": "example-tu",
		"name": "Пример технических условий",
		"description": "Пример структуры файла ТУ для демонстрации",
		"rules": [
			{
				"parameter": "material",
				"code": "ВД",
				"description": "Водостойкий материал"
			}
		],
		"abbreviationTemplate": "{material}-{climate}-{size}"
	}
]
```

**Пример запроса:**

```bash
curl http://localhost:5173/api/technical-specs
```

---

### 9. Получение технического условия

**GET** `/api/technical-specs/:id`

Получает конкретное техническое условие по ID.

**Параметры пути:**

- `id` (string) - идентификатор ТУ

**Ответ 200 OK:**

```json
{
	"id": "example-tu",
	"name": "Пример технических условий",
	"description": "Пример структуры файла ТУ для демонстрации",
	"rules": [
		{
			"parameter": "material",
			"code": "ВД",
			"description": "Водостойкий материал"
		},
		{
			"parameter": "climate",
			"code": "У1",
			"description": "Умеренный климат"
		}
	],
	"abbreviationTemplate": "{material}-{climate}-{size}"
}
```

**Ошибки:**

- `404 Not Found` - техническое условие не найдено

**Пример запроса:**

```bash
curl http://localhost:5173/api/technical-specs/example-tu
```

---

## Операции обработки (Processing Operations)

### 10. Список операций заявки

**GET** `/api/applications/:id/operations`

Получает список всех операций обработки для заявки.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки

**Query параметры:**

- `type` (string, опционально) - фильтр по типу операции: `ocr`, `llm_product_type`, `llm_abbreviation`

**Ответ 200 OK:**

```json
[
	{
		"id": "550e8400-e29b-41d4-a716-446655440001",
		"applicationId": "550e8400-e29b-41d4-a716-446655440000",
		"type": "ocr",
		"provider": "yandex",
		"status": "completed",
		"externalOperationId": null,
		"requestData": {
			"endpoint": "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
			"method": "POST"
		},
		"result": {
			"text": "Извлеченный текст..."
		},
		"error": null,
		"createdAt": "2024-01-15T10:30:00.000Z",
		"startedAt": "2024-01-15T10:30:01.000Z",
		"completedAt": "2024-01-15T10:30:05.000Z",
		"progress": null,
		"retryCount": 0,
		"maxRetries": 3
	}
]
```

**Пример запроса:**

```bash
# Все операции заявки
curl http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/operations

# Только OCR операции
curl "http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/operations?type=ocr"
```

---

### 11. Получение операции

**GET** `/api/applications/:id/operations/:operationId`

Получает детальную информацию об операции обработки.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки
- `operationId` (string, UUID) - идентификатор операции

**Ответ 200 OK:**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440001",
	"applicationId": "550e8400-e29b-41d4-a716-446655440000",
	"type": "ocr",
	"provider": "yandex",
	"status": "running",
	"externalOperationId": "operation-12345",
	"requestData": {
		"endpoint": "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
		"method": "POST"
	},
	"result": null,
	"error": null,
	"createdAt": "2024-01-15T10:30:00.000Z",
	"startedAt": "2024-01-15T10:30:01.000Z",
	"completedAt": null,
	"progress": {
		"current": 5,
		"total": 10,
		"message": "Обработка страниц..."
	},
	"retryCount": 0,
	"maxRetries": 3
}
```

**Ошибки:**

- `400 Bad Request` - неверный формат UUID
- `404 Not Found` - заявка или операция не найдены

**Пример запроса:**

```bash
curl http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/operations/550e8400-e29b-41d4-a716-446655440001
```

---

### 12. Проверка статуса операции

**POST** `/api/applications/:id/operations/:operationId/check`

Проверяет статус асинхронной операции у внешнего сервиса и обновляет его в БД.

**Параметры пути:**

- `id` (string, UUID) - идентификатор заявки
- `operationId` (string, UUID) - идентификатор операции

**Ответ 200 OK:**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440001",
	"applicationId": "550e8400-e29b-41d4-a716-446655440000",
	"type": "ocr",
	"provider": "yandex",
	"status": "completed",
	"externalOperationId": "operation-12345",
	"requestData": {
		"endpoint": "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
		"method": "POST"
	},
	"result": {
		"text": "Извлеченный текст из многостраничного PDF..."
	},
	"error": null,
	"createdAt": "2024-01-15T10:30:00.000Z",
	"startedAt": "2024-01-15T10:30:01.000Z",
	"completedAt": "2024-01-15T10:35:00.000Z",
	"progress": null,
	"retryCount": 0,
	"maxRetries": 3
}
```

**Ошибки:**

- `400 Bad Request` - неверный формат UUID или операция не принадлежит заявке
- `404 Not Found` - заявка или операция не найдены
- `500 Internal Server Error` - ошибка при проверке статуса у внешнего сервиса

**Пример запроса:**

```bash
curl -X POST http://localhost:5173/api/applications/550e8400-e29b-41d4-a716-446655440000/operations/550e8400-e29b-41d4-a716-446655440001/check
```

**Примечание:** Этот эндпоинт используется для проверки статуса асинхронных операций (например, многостраничные PDF в YandexOCR). Для синхронных операций статус обновляется автоматически.

---

## Коды состояния HTTP

- `200 OK` - успешный запрос
- `201 Created` - ресурс успешно создан
- `202 Accepted` - запрос принят, обработка выполняется асинхронно (для асинхронных OCR операций)
- `400 Bad Request` - ошибка валидации запроса
- `404 Not Found` - ресурс не найден
- `413 Payload Too Large` - размер файла превышает лимит
- `415 Unsupported Media Type` - неподдерживаемый тип файла
- `500 Internal Server Error` - внутренняя ошибка сервера
- `501 Not Implemented` - функция не реализована (заглушка)

## Обработка ошибок

Все ошибки возвращаются в формате:

```json
{
	"error": "Описание ошибки"
}
```

Для ошибок валидации может быть добавлено поле `details`:

```json
{
	"error": "Ошибка валидации",
	"details": {
		"field": "описание проблемы"
	}
}
```
