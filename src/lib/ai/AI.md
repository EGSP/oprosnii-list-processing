# Модуль AI (OCR и LLM)

Модуль для работы с внешними AI сервисами: YandexOCR для извлечения текста из файлов и YandexGPT для анализа текста.

## Структура модуля

Расположение: `src/lib/ai/`

### Файлы

- **`config.ts`** - Конфигурация AI сервисов (модели, API ключи, endpoints)
- **`ocr.ts`** - Модуль OCR и извлечения текста из файлов (использует switch по провайдеру)
- **`llm.ts`** - Модуль LLM для работы с различными провайдерами (использует switch по провайдеру)
- **`types.ts`** - TypeScript типы для модуля AI
- **`index.ts`** - Централизованный экспорт
- **`yandex/ocr.ts`** - Модуль Yandex OCR (функции для работы с Yandex OCR API)
- **`yandex/llm.ts`** - Модуль Yandex LLM (функции для работы с YandexGPT API)

## Конфигурация

### Переменные окружения

Все настройки моделей и API ключей находятся в `config.ts`. Модуль использует `$env/dynamic/private` для доступа к приватным переменным окружения в SvelteKit. Эти переменные доступны только на сервере и не попадают в клиентский код.

**Важно:** В SvelteKit переменные окружения без префикса `PUBLIC_` автоматически считаются приватными и доступны только на сервере. Это обеспечивает безопасность API ключей.

Для работы необходимо установить следующие переменные окружения в файле `.env` в корне проекта (см. `.env.example`):

#### YandexOCR

- `YANDEX_OCR_API_KEY` (обязательно) - API ключ для YandexOCR
- `YANDEX_OCR_FOLDER_ID` (опционально) - Folder ID для YandexOCR
- `YANDEX_OCR_ENDPOINT` (опционально) - Endpoint для синхронных запросов (по умолчанию: синхронный endpoint)
- `YANDEX_OCR_ASYNC_ENDPOINT` (опционально) - Endpoint для асинхронных запросов (для многостраничных PDF)
- `YANDEX_OCR_OPERATION_ENDPOINT` (опционально) - Endpoint для проверки статуса операций (по умолчанию: `https://operation.api.cloud.yandex.net/operations`)
- `YANDEX_OCR_GET_RECOGNITION_ENDPOINT` (опционально) - Endpoint для получения результатов распознавания после завершения операции (по умолчанию: `https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition`)
- `YANDEX_OCR_MODEL` (опционально) - Модель/версия YandexOCR (по умолчанию: "latest")
- `YANDEX_OCR_ENDPOINT` (опционально) - Endpoint API (по умолчанию: "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText")

#### YandexGPT

- `YANDEX_GPT_API_KEY` (обязательно) - API ключ для YandexGPT
- `YANDEX_GPT_FOLDER_ID` (опционально) - Folder ID для YandexGPT
- `YANDEX_GPT_MODEL` (обязательно) - Модель YandexGPT (например, "yandexgpt", "yandexgpt-lite")
- `YANDEX_GPT_ENDPOINT` (опционально) - Endpoint API (по умолчанию: "https://llm.api.cloud.yandex.net/foundationModels/v1/completion")

### Явное определение моделей

Все настройки моделей находятся в `src/lib/ai/config.ts`. При необходимости изменения моделей редактируйте функции `getYandexOCRConfig()` и `getYandexGPTConfig()`.

## OCR модуль

### Функции

#### `extractTextFromFile(fileBuffer: Buffer, mimeType: string, filename?: string): Promise<string>`

Извлекает текст из файла (старая функция для обратной совместимости). Поддерживает:

- **Изображения (PNG, JPG, JPEG)**: Использует YandexOCR API
- **PDF**: Использует YandexOCR API (синхронно для одностраничных, асинхронно для многостраничных)
- **DOCX**: Извлечение текста через библиотеку `mammoth`
- **XLSX**: Извлечение текста через библиотеку `xlsx`

**Параметры:**

- `fileBuffer` - Buffer с содержимым файла
- `mimeType` - MIME тип файла
- `filename` - Имя файла (опционально, для определения расширения)

**Возвращает:** Извлеченный текст

**Ошибки:**

- `OCRError` - Ошибка при извлечении текста или вызове YandexOCR API

**Примечание:** Для асинхронных операций (многостраничные PDF) используйте `extractTextFromFileWithOperation`.

#### `extractTextFromFileWithOperation(applicationId: string, fileInfo: FileInfo): Promise<{ text?: string; operationId?: string }>`

Извлекает текст из файла с созданием операции обработки. Создает операцию типа 'ocr' в БД.

**Параметры:**

- `applicationId` - ID заявки
- `fileInfo` - Информация о файле:
  - `buffer: Buffer` - Содержимое файла
  - `mimeType: string` - MIME тип файла
  - `fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown'` - Тип файла
  - `pageCount: number` - Количество страниц (важно для PDF - если > 1, используется async endpoint)
  - `filename?: string` - Имя файла (опционально)

**Возвращает:**

- `{ text: string }` - для синхронных операций (изображения, одностраничные PDF, DOCX, XLSX)
- `{ operationId: string }` - для асинхронных операций (многостраничные PDF)

**Особенности:**

- Для многостраничных PDF (pageCount > 1) автоматически используется async endpoint из конфигурации (`YANDEX_OCR_ASYNC_ENDPOINT`)
- Для одностраничных PDF и изображений используется синхронный endpoint
- Рекомендуется использовать `getFileInfo()` из `$lib/storage` для получения полной информации о файле

**Ошибки:**

- `OCRError` - Ошибка при извлечении текста или вызове YandexOCR API

#### `checkOCROperation(operationId: string): Promise<ProcessingOperation | null>`

Проверяет статус асинхронной операции OCR. Использует switch по провайдеру для вызова соответствующей функции.

**Параметры:**

- `operationId` - ID операции в БД

**Возвращает:**

- `ProcessingOperation | null` - Обновленная операция или null, если не найдена

**Особенности:**

- Для провайдера 'yandex' проверяет статус через Yandex OCR API
- Для провайдера 'local' возвращает операцию как есть (локальные операции всегда синхронные)
- Автоматически обновляет статус операции в БД при завершении
- После завершения операции автоматически вызывается `GetRecognition` endpoint для получения полных результатов распознавания
- Используется `YANDEX_OCR_GET_RECOGNITION_ENDPOINT` из конфигурации или значение по умолчанию
- Если `GetRecognition` не удался, используется fallback - извлечение текста из ответа `Operation.Get`

**Ошибки:**

- `OCRError` - Ошибка при проверке статуса операции или получении результатов

### Пример использования

```typescript
import {
	extractTextFromFile,
	extractTextFromFileWithOperation,
	checkOCROperation
} from '$lib/ai';

// Старый способ (для обратной совместимости)
const fileBuffer = Buffer.from(/* ... */);
const text = await extractTextFromFile(fileBuffer, 'application/pdf', 'document.pdf');

// Новый способ с операциями (рекомендуется использовать getFileInfo)
import { getFileInfo } from '$lib/storage';

const fileInfo = await getFileInfo('application-id');
if (fileInfo) {
	const result = await extractTextFromFileWithOperation('application-id', {
		buffer: fileInfo.buffer,
		mimeType: fileInfo.mimeType,
		fileType: fileInfo.fileType,
		pageCount: fileInfo.pageCount,
		filename: fileInfo.filename
	});

if (result.operationId) {
	// Асинхронная операция - проверяем статус
	const operation = await checkOCROperation(result.operationId);
	if (operation && operation.status === 'completed' && operation.result) {
		const text = (operation.result as { text: string }).text;
		console.log(text);
	}
} else if (result.text) {
	// Синхронная операция завершена
	console.log(result.text);
}
```

## LLM модуль

### Функции

#### `callYandexGPT(prompt: string, systemPrompt?: string, options?: LLMOptions, operationConfig?: { applicationId: string; type: ProcessingOperationType }): Promise<string>`

Вызывает YandexGPT API и возвращает текстовый ответ. Опционально создает операцию обработки в БД.

**Параметры:**

- `prompt` - Промпт для LLM
- `systemPrompt` - Системный промпт (опционально)
- `options` - Параметры модели:
  - `temperature` - Температура (по умолчанию: 0.6)
  - `maxTokens` - Максимальное количество токенов (по умолчанию: 2000)
  - `topP` - Top-p sampling (опционально)
  - `topK` - Top-k sampling (опционально)

**Возвращает:** Текстовый ответ от LLM

**Ошибки:**

- `LLMError` - Ошибка при вызове YandexGPT API

#### `callYandexGPTStructured<T>(prompt: string, schema: T, systemPrompt?: string, options?: LLMOptions, maxRetries?: number, operationConfig?: { applicationId: string; type: ProcessingOperationType }): Promise<z.infer<T>>`

Вызывает YandexGPT с structured output через Zod схему. Парсит JSON из ответа LLM и валидирует его через Zod схему.

**Параметры:**

- `prompt` - Промпт для LLM (должен содержать инструкцию возвращать JSON)
- `schema` - Zod схема для валидации ответа
- `systemPrompt` - Системный промпт (опционально)
- `options` - Параметры модели
- `maxRetries` - Максимальное количество попыток (по умолчанию: 2)

**Возвращает:** Валидированный объект, соответствующий схеме

**Ошибки:**

- `LLMError` - Ошибка при вызове API, парсинге JSON или валидации

### Пример использования

```typescript
import { callYandexGPT, callYandexGPTStructured } from '$lib/ai';
import { z } from 'zod';

// Простой вызов
const response = await callYandexGPT('Что такое TypeScript?');

// Structured output
const schema = z.object({
	name: z.string(),
	age: z.number()
});

const result = await callYandexGPTStructured('Верни JSON с полями name и age', schema);
console.log(result.name, result.age);
```

## Структура ответов от сервисов

### YandexOCR

Ответ от YandexOCR API имеет следующую структуру:

```json
{
	"result": {
		"textAnnotation": {
			"fullText": "Извлеченный текст...",
			"blocks": [
				{
					"lines": [
						{
							"words": [{ "text": "слово" }]
						}
					]
				}
			]
		}
	}
}
```

Модуль автоматически извлекает текст из различных форматов ответа.

### YandexGPT

Ответ от YandexGPT API имеет следующую структуру:

```json
{
	"result": {
		"alternatives": [
			{
				"message": {
					"text": "Ответ от LLM..."
				}
			}
		]
	}
}
```

Модуль автоматически извлекает текст из ответа.

## Обработка ошибок

Модуль использует кастомные классы ошибок:

- **`OCRError`** - Ошибка при работе с OCR
- **`LLMError`** - Ошибка при работе с LLM

Все ошибки содержат сообщение и опциональную причину (cause).

```typescript
import { extractTextFromFile, OCRError } from '$lib/ai';

try {
	const text = await extractTextFromFile(buffer, mimeType);
} catch (error) {
	if (error instanceof OCRError) {
		console.error('OCR error:', error.message);
		console.error('Cause:', error.cause);
	}
}
```

## Зависимости

- `mammoth` - Извлечение текста из DOCX
- `xlsx` - Извлечение текста из XLSX
- `zod` - Валидация structured output

## Работа с операциями обработки

Модуль AI интегрирован с системой операций обработки (`ProcessingOperation`):

- **OCR операции**: Создаются автоматически при вызове `extractTextFromFileWithOperation()`
  - Синхронные операции (изображения, одностраничные PDF, DOCX, XLSX): сразу `status='completed'`
  - Асинхронные операции (многостраничные PDF): `status='running'` с `providerData.operationId`
  - Провайдеры: 'yandex' (для изображений и PDF), 'local' (для DOCX и XLSX)
- **LLM операции**: Создаются автоматически при вызове `callYandexGPT()` или `callYandexGPTStructured()` с `operationConfig`
  - Все LLM операции синхронные: сразу `status='completed'`
  - Провайдеры: 'yandex' (для YandexGPT)

Операции хранятся в БД и позволяют отслеживать статус обработки. Подробнее см. [`../storage/STORAGE.md`](../storage/STORAGE.md).

## Модули провайдеров

### Yandex OCR (`yandex/ocr.ts`)

Модуль содержит функции для работы с Yandex OCR API:

- `callYandexOCR()` - Отправка запроса в Yandex OCR API
- `getYandexOCRRecognition()` - Получение результатов распознавания через GetRecognition endpoint
- `checkYandexOCROperation()` - Проверка статуса асинхронной операции

### Yandex LLM (`yandex/llm.ts`)

Модуль содержит функции для работы с YandexGPT API:

- `callYandexGPT()` - Вызов YandexGPT API с текстовым ответом
- `callYandexGPTStructured()` - Вызов YandexGPT с structured output через Zod схему

**Примечание:** Основные модули `ocr.ts` и `llm.ts` используют switch по провайдеру для вызова соответствующих функций из модулей провайдеров.

## Примечания

- OCR результат кешируется в БД при первом извлечении текста (через операции)
- Для structured output используется автоматический парсинг JSON с удалением markdown разметки
- При ошибке валидации structured output делается повторная попытка с более строгим промптом
- Все настройки моделей находятся в `config.ts` для удобного изменения
- Операции обработки позволяют отслеживать прогресс и обрабатывать асинхронные задачи
