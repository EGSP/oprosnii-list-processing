---
name: Удаление shadcn и bits-ui
overview: Удаление зависимостей shadcn-svelte и bits-ui с заменой Dialog и Accordion на собственные реализации на нативном HTML и Tailwind, без изменения публичного API компонентов для потребителей.
todos: []
isProject: false
---

# План: удаление shadcn и bits-ui из проекта

## Текущее состояние

- **Зависимости:** `shadcn-svelte` (devDependencies), `bits-ui` (dependencies) в [package.json](package.json).
- **Конфиг shadcn:** [components.json](components.json) — только для CLI, после удаления пакета не нужен.
- **Компоненты на bits-ui:**
  - **Dialog:** [dialog.svelte](src/lib/components/ui/dialog.svelte), [dialog-content.svelte](src/lib/components/ui/dialog-content.svelte), [dialog-title.svelte](src/lib/components/ui/dialog-title.svelte), [dialog-description.svelte](src/lib/components/ui/dialog-description.svelte) — используют `Dialog.Root`, `Portal`, `Dialog.Backdrop`, `Dialog.Content`, `Dialog.Close`, `Dialog.Title`, `Dialog.Description`.
  - **Accordion:** [accordion.svelte](src/lib/components/ui/accordion.svelte), [accordion-item.svelte](src/lib/components/ui/accordion-item.svelte), [accordion-trigger.svelte](src/lib/components/ui/accordion-trigger.svelte), [accordion-content.svelte](src/lib/components/ui/accordion-content.svelte) — используют `Accordion.Root`, `Accordion.Item`, `Accordion.Header`, `Accordion.Trigger`, `Accordion.Content`.
- **Использование:** Dialog с `bind:open` в [ApplicationDetails.svelte](src/lib/components/ApplicationDetails.svelte) и [OperationStatusBadge.svelte](src/lib/components/OperationStatusBadge.svelte). Accordion (один блок, `type="single" collapsible`) только в [OperationStatusBadge.svelte](src/lib/components/OperationStatusBadge.svelte).
- **Остальные UI-компоненты** (button, badge, card, input, textarea, alert, skeleton, dialog-header, dialog-footer) — только `$lib/utils/cn` и Tailwind, правки не требуются.

Цель: убрать обе зависимости, сохранить Tailwind и текущий API компонентов дл  
я страниц/компонентов (те же имена и `bind:open` для Dialog, те же теги Accordion/AccordionItem/AccordionTrigger/AccordionContent).

---

## 1. Замена Dialog на нативный `<dialog>`

Использовать нативный элемент : он даёт overlay, блокировку фона, закрытие по Escape и возможность закрытия по клику на backdrop (через `dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); })`).

- **dialog.svelte**  
  - Принимать `open` как `$bindable(false)` и `children` (Snippet).  
  - Рендерить один `<dialog>` и внутри него `{@render children?.()}`.  
  - В `$effect` или через action: при `open === true` вызывать `dialogEl.showModal()`, при `false` — `dialogEl.close()`.  
  - Слушать событие `close` у `<dialog>` и синхронизировать `open = false` (чтобы Escape/backdrop не оставляли `open` в true).  
  - Не использовать Portal — содержимое модалки остаётся в дереве компонентов; показ поверх страницы обеспечивает браузер.
- **dialog-content.svelte**  
  - Убрать импорты bits-ui и Portal.  
  - Рендерить:  
    - Backdrop: первый дочерний блок с классами затемнения (как сейчас `fixed inset-0 z-50 bg-black/80`).  
    - Контейнер контента: div с текущими классами панели и кнопкой закрытия (иконка X), по клику вызывать закрытие (например через контекст или передачу callback из dialog.svelte).
  - Закрытие: в корневом dialog.svelte задать через setContext функцию `close()`, в dialog-content при клике на кнопку и при клике по backdrop вызывать эту функцию (и при необходимости вызывать `dialogEl.close()` в dialog.svelte).  
  - Анимации: убрать зависимости от `data-[state=open]`/`data-[state=closed]` (bits-ui). Либо оставить простые классы без анимации, либо добавить свои классы на основе переданного из контекста `open` (например `class:open`), чтобы не тянуть tailwindcss-animate.
- **dialog-title.svelte** и **dialog-description.svelte**  
  - Заменить `<Dialog.Title>` / `<Dialog.Description>` на обычные элементы (например `<h2>` и `<p>`) с теми же классами и при необходимости с `id` для `aria-labelledby` / `aria-describedby` у `<dialog>` в dialog.svelte (для доступности).

Публичный API для страниц не меняется: по-прежнему `<Dialog bind:open={purgeModalOpen}>` и внутри `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`.

---

## 2. Замена Accordion на свою реализацию (контекст + состояние)

Текущее использование: один аккордеон с одним пунктом, `type="single" collapsible`. Реализовать поддержку того же API: `Accordion type="single" collapsible`, `AccordionItem value="...">`, `AccordionTrigger`, `AccordionContent`.

- **accordion.svelte**  
  - Убрать bits-ui.  
  - Принимать `type?: 'single' | 'multiple'`, `collapsible?: boolean`, `children`.  
  - Создать контекст: например `setContext('accordion', { type, collapsible, openValues: writable<string[]>([]), toggle(value: string) })`.  
  - Для `type="single"`: при открытии нового пункта обнулять остальные; при `collapsible` разрешать закрыть текущий.  
  - Рендерить обёртку (div) и `{@render children?.()}`.
- **accordion-item.svelte**  
  - Получать контекст аккордеона и обязательный `value: string`.  
  - Рендерить обёртку с классом `border-b` и передавать в контекст потомков значение `value` (через свой setContext для item).
- **accordion-trigger.svelte**  
  - Получать контекст accordion и accordion-item.  
  - По клику вызывать `toggle(value)`.  
  - Рендерить `<button type="button">` с классами (как сейчас) и иконкой ChevronDown; для иконки вращения использовать класс, зависящий от того, открыт ли текущий item (например `class:rotate-180` от `openValues.includes(value)`).
- **accordion-content.svelte**  
  - Показывать контент только если `openValues.includes(value)` (из контекста item).  
  - Классы: оставить `overflow-hidden text-sm`; анимацию высоты можно упростить (см. п. 4).

Разметка в [OperationStatusBadge.svelte](src/lib/components/OperationStatusBadge.svelte) остаётся той же.

---

## 3. Обновление tailwind.config.js

- **Анимация аккордеона:** сейчас используются keyframes `accordion-down` / `accordion-up` с переменной `--bits-accordion-content-height` ([tailwind.config.js](tailwind.config.js)).  
  - Вариант A: оставить keyframes, но в своей реализации задавать высоту контента через JS (например ResizeObserver) в CSS-переменную на контейнере (например `--accordion-content-height`) и использовать её в keyframes вместо `--bits-accordion-content-height`.  
  - Вариант B (проще): убрать анимацию по высоте и использовать только показ/скрытие (например `max-height` + `overflow-hidden` или классы без keyframes). Тогда keyframes и animation для accordion можно удалить из конфига.

Рекомендация: вариант B для минимальных изменений; при желании позже добавить плавную высоту по варианту A.

---

## 4. Удаление зависимостей и конфига shadcn

- В [package.json](package.json): удалить из `devDependencies` поле `"shadcn-svelte"`, из `dependencies` — `"bits-ui"`.
- Удалить файл [components.json](components.json).
- Выполнить `npm install` для обновления lockfile.

---

## 5. Проверка

- Убедиться, что нигде не осталось импортов из `bits-ui` или `shadcn-svelte`.
- Запустить `npm run build` и проверить страницы с модалкой (очистка в ApplicationDetails и OperationStatusBadge) и блок «Детали операции» в OperationStatusBadge.
- При необходимости проверить доступность: фокус в модалке, закрытие по Escape, `aria-labelledby`/`aria-describedby` у dialog.

---

## Порядок работ (кратко)

1. Реализовать новый Dialog (dialog.svelte, dialog-content.svelte, dialog-title.svelte, dialog-description.svelte) на нативном `<dialog>` и контексте для закрытия.
2. Реализовать новый Accordion (accordion.svelte, accordion-item.svelte, accordion-trigger.svelte, accordion-content.svelte) на контексте и локальном состоянии.
3. При необходимости упростить анимации в tailwind.config.js (убрать или переименовать переменную для accordion).
4. Удалить `bits-ui` и `shadcn-svelte` из package.json, удалить components.json, выполнить `npm install`.
5. Сборка и ручная проверка модалки и аккордеона.

После этого Tailwind и все остальные UI-компоненты (button, badge, card, alert, input, textarea, skeleton и т.д.) продолжают использоваться без изменений; зависимости от shadcn и bits-ui в проекте не остаётся.