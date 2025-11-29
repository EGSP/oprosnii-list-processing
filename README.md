# AI-система обработки технических заявок

Автоматизация обработки заявок на изготовление продукции. Заявки приходят в разных форматах, требуется извлекать технические параметры и составлять техническую аббревиатуру продукции.

## Технологии

- **Frontend/Backend**: SvelteKit
- **Язык**: TypeScript
- **Валидация**: Zod
- **AI**: LangChain.js (настраивается)

## Установка

```bash
npm install
```

## Разработка

```bash
npm run dev
```

Откройте [http://localhost:5173](http://localhost:5173) в браузере.

## Сборка

```bash
npm run build
```

## Проверка кода

```bash
npm run check      # Проверка типов TypeScript
npm run lint       # Проверка ESLint
npm run format     # Форматирование кода Prettier
```

## Структура проекта

```
src/
  lib/
    ai/            # Модуль AI (OCR и LLM)
    business/      # Бизнес-логика (чистые функции)
    storage/       # Модуль хранилища данных
    components/    # UI компоненты
    config.ts      # Конфигурация приложения
  routes/
    api/          # REST API эндпоинты
    +page.svelte  # Главная страница
data/
  tu/             # JSON файлы с техническими условиями (ТУ)
  db/             # База данных SQLite
  uploads/        # Загруженные файлы заявок
```

## Документация

- **[src/lib/storage/STORAGE.md](src/lib/storage/STORAGE.md)** - Документация модуля хранилища данных (БД, файлы, ТУ, операции)
- **[src/lib/business/BUSINESS.md](src/lib/business/BUSINESS.md)** - Документация модуля бизнес-логики
- **[src/lib/business/API.md](src/lib/business/API.md)** - Документация REST API
- **[src/lib/ai/AI.md](src/lib/ai/AI.md)** - Документация модуля AI (OCR и LLM)
- **[src/lib/components/COMPONENTS.MD](src/lib/components/COMPONENTS.MD)** - Документация UI компонентов
- **[PROJECT.md](PROJECT.md)** - Общее описание проекта и архитектура

## Конфигурация

Переменные окружения для клиентской части должны иметь префикс `VITE_`:

- `VITE_MAX_FILE_SIZE_MB=10`
- `VITE_MAX_TEXT_LENGTH_FOR_LLM=6000`

Серверные переменные (API ключи для LLM/OCR) указываются без префикса:

- `YANDEX_OCR_API_KEY` - API ключ для YandexOCR (обязательно)
- `YANDEX_OCR_FOLDER_ID` - Folder ID для YandexOCR (опционально)
- `YANDEX_GPT_API_KEY` - API ключ для YandexGPT (обязательно)
- `YANDEX_GPT_FOLDER_ID` - Folder ID для YandexGPT (опционально)
- `YANDEX_GPT_MODEL` - Модель YandexGPT (по умолчанию: "yandexgpt")

Полный список переменных окружения см. в файле `.env.example`.

## Статус проекта

✅ Этап 1: Инициализация проекта - завершен

- SvelteKit проект создан и настроен
- Структура папок создана
- ESLint и Prettier настроены
- Zod установлен
- Базовая конфигурация создана

✅ Этап 2: Реализация хранилища данных - завершен

- SQLite база данных для метаданных заявок
- Файловое хранилище для исходных файлов заявок
- Управление техническими условиями (ТУ)
- Полный CRUD API для работы с заявками
- Валидация данных через Zod
- Обработка ошибок

✅ Этап 3: Реализация базового веб-интерфейса - завершен

- Двухпанельный layout (левая панель со списком заявок, правое окно с деталями)
- Компонент загрузки файлов с drag-n-drop и валидацией
- Список заявок с сортировкой по дате и отображением статуса
- Детальное отображение заявки с результатами обработки
- Выбор технических условий и обработка заявок
- API клиент для работы с REST API
- Адаптивный дизайн для мобильных устройств
- Обработка ошибок и пустых состояний

✅ Этап 4: Интеграция OCR и LLM сервисов - завершен

- Модуль конфигурации AI сервисов (`src/lib/ai/config.ts`) с явным определением моделей
- Модуль OCR (`src/lib/ai/ocr.ts`) с поддержкой YandexOCR для изображений/PDF и извлечением текста из DOCX/XLSX
- Модуль LLM (`src/lib/ai/llm.ts`) для работы с YandexGPT через REST API
- Structured output через Zod схемы для валидации ответов LLM
- Бизнес-логика обработки заявок (`src/lib/business/processing.ts`)
- REST API эндпоинты для определения типа изделия и формирования аббревиатуры
- Документация модуля AI (`src/lib/ai/AI.md`)

✅ Этап 5: Система ProcessingOperation - завершен

- Таблица `processing_operations` в БД для хранения операций обработки
- Репозиторий операций (`src/lib/storage/operationsRepository.ts`) с CRUD операциями
- Поддержка синхронных и асинхронных операций (OCR для многостраничных PDF)
- Интеграция операций в OCR и LLM модули
- REST API эндпоинты для работы с операциями:
  - `GET /api/applications/:id/operations` - список операций заявки
  - `GET /api/applications/:id/operations/:operationId` - получение операции
  - `POST /api/applications/:id/operations/:operationId/check` - проверка статуса асинхронной операции
- Обновление существующих эндпоинтов для возврата ID созданных операций
- Документация обновлена во всех модулях
