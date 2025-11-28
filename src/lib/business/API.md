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

### 5. Определение типа изделия

**POST** `/api/applications/:id/detect-product-type`

Определяет тип изделия из заявки с использованием OCR и LLM.

**Параметры пути:**
- `id` (string, UUID) - идентификатор заявки

**Ответ 501 Not Implemented:**
```json
{
  "error": "OCR и LLM сервисы не настроены. Функция будет доступна после настройки внешних сервисов."
}
```

**Статус:** ⚠️ Заглушка. Требует реализации OCR и LLM сервисов.

---

### 6. Формирование аббревиатуры

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

**Ответ 501 Not Implemented:**
```json
{
  "error": "LLM сервис не настроен. Функция будет доступна после настройки внешних сервисов."
}
```

**Ошибки:**
- `400 Bad Request` - неверный формат UUID или отсутствует technicalSpecId
- `404 Not Found` - заявка не найдена

**Статус:** ⚠️ Заглушка. Требует реализации LLM сервиса.

---

## Технические условия (Technical Specifications)

### 7. Список технических условий

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

### 8. Получение технического условия

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

## Коды состояния HTTP

- `200 OK` - успешный запрос
- `201 Created` - ресурс успешно создан
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

