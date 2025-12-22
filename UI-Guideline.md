# UI Guidelines

Краткий гайдлайн по использованию стилей, отступов и компонентов в проекте.

## Отступы (Spacing)

Используем стандартную шкалу Tailwind CSS для единообразия:

### Стандартные значения padding
- `p-4` (1rem / 16px) - стандартные отступы для контейнеров и секций
- `p-6` (1.5rem / 24px) - для CardContent (стандарт shadcn)
- `p-8` (2rem / 32px) - для больших контейнеров (EmptyState, FileUpload)

### Вертикальные отступы
- `space-y-4` (1rem) - для форм и списков элементов
- `mb-2` (0.5rem) - для маленьких отступов (между label и input)
- `mb-4` (1rem) - для стандартных отступов между элементами
- `mb-6` (1.5rem) - для отступов между секциями
- `mb-8` (2rem) - для больших отступов между секциями
- `mt-2` (0.5rem) - для маленьких верхних отступов
- `mt-4` (1rem) - для стандартных верхних отступов

### Горизонтальные отступы
- `gap-2` (0.5rem) - для маленьких элементов (кнопки в группе)
- `gap-4` (1rem) - для стандартных промежутков между элементами
- `px-4` (1rem) - для горизонтальных отступов в контейнерах
- `px-6` (1.5rem) - для больших горизонтальных отступов

### Специальные случаи
- `last:mb-0` - удаление отступа у последнего элемента в списке секций

## Компоненты shadcn

### Card
- `Card` - основной контейнер с `rounded-lg border bg-card`
- `CardContent` - использует `p-6 pt-0` по умолчанию (не переопределять)
- `CardHeader` - использует `p-6` и `space-y-1.5` по умолчанию

### Button
- Размеры: `size="sm"`, `size="default"`, `size="lg"`, `size="icon"`
- Варианты: `variant="default"`, `variant="secondary"`, `variant="destructive"`, `variant="outline"`, `variant="ghost"`, `variant="link"`
- Иконки: используем `mr-2 h-4 w-4` для иконок в кнопках

### Badge
- Варианты: `variant="default"`, `variant="secondary"`, `variant="destructive"`, `variant="outline"`

### Alert
- Варианты: `variant="default"`, `variant="destructive"`
- Использует `p-4` по умолчанию

### Dialog
- `DialogContent` - использует `p-6` и `gap-4` по умолчанию
- `DialogHeader` - использует `space-y-1.5` по умолчанию
- `DialogFooter` - использует `space-x-2` по умолчанию

## Формы

### Структура формы
```svelte
<form class="space-y-4 mt-4">
  <div class="mb-4">
    <label for="field-id" class="block text-sm font-medium mb-2">
      Название поля:
    </label>
    <Input id="field-id" />
  </div>
</form>
```

### Правила
- Использовать `space-y-4` для вертикальных отступов между полями в форме
- Использовать `mb-4` для отступов между группами полей
- Labels: `mb-2` для отступа от input
- Всегда связывать label с input через `for` и `id`

## Секции и контейнеры

### Основные контейнеры
- Стандартные контейнеры: `p-4` или `p-6`
- Секции в Card: используют `mb-8` между секциями, `last:mb-0` для последней
- Заголовки секций: `mb-4` для отступа от контента

### Пример структуры секции
```svelte
<Card class="mb-8 last:mb-0">
  <CardContent>
    <h3 class="m-0 mb-4 text-lg font-semibold text-foreground">
      Заголовок секции
    </h3>
    <!-- Контент -->
  </CardContent>
</Card>
```

## Tailwind вместо кастомных стилей

### Правила
- **Всегда предпочитать Tailwind классы** кастомным CSS
- Использовать `<style>` только для:
  - Сложной логики (hover эффекты на дочерних компонентах)
  - Анимаций, которые нельзя выразить через Tailwind
  - Стилизации дочерних компонентов через `:global()`

### Примеры замены
- ❌ `.header { padding: 1rem; }` 
- ✅ `class="p-4"`

- ❌ `.form-group { margin-bottom: 1rem; }`
- ✅ `class="mb-4"`

- ❌ `.application-content { padding: 1rem; }`
- ✅ `class="p-4"`

## Svelte 5

### Синтаксис
- Использовать `{@render children?.()}` вместо `<slot />`
- Использовать `$props()` и `$bindable()` для пропсов
- Использовать `Snippet` тип для children
- Использовать `let` вместо `const` для `$bindable()` переменных

### Пример компонента
```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  
  interface $$Props {
    class?: string;
    children?: Snippet;
  }
  
  let { class: className = "", children }: $$Props = $props();
</script>

<div class={cn("p-4", className)}>
  {@render children?.()}
</div>
```

## Типографика

### Заголовки
- `h2`: `text-2xl font-semibold` (24px)
- `h3`: `text-lg font-semibold` (18px)
- Всегда использовать `m-0` для сброса margin по умолчанию

### Текст
- Основной текст: `text-sm` (14px) или `text-base` (16px)
- Вторичный текст: `text-sm text-muted-foreground`
- Малый текст: `text-xs`

## Цвета

Используем CSS переменные из shadcn:
- `text-foreground` - основной текст
- `text-muted-foreground` - вторичный текст
- `bg-background` - фон
- `bg-card` - фон карточек
- `bg-muted` - фон для выделенных блоков
- `border-border` - границы
- `text-primary` - основной цвет
- `bg-primary/10` - светлый фон с основным цветом

## Иконки

- Размеры: `h-4 w-4` для маленьких, `h-5 w-5` для стандартных, `size={32}` для больших
- Отступы: `mr-2` для иконок слева от текста
- Цвета: наследуют цвет текста, или `text-muted-foreground` для вторичных

## Адаптивность

- Использовать `sm:`, `md:`, `lg:` префиксы для адаптивных стилей
- Пример: `flex-col sm:flex-row` для изменения направления на больших экранах

## Чеклист перед коммитом

- [ ] Все отступы используют стандартную шкалу Tailwind
- [ ] Нет кастомных CSS стилей, которые можно заменить на Tailwind
- [ ] Формы используют `space-y-4` для вертикальных отступов
- [ ] Секции используют `mb-8` между собой
- [ ] Все компоненты соответствуют стандартам shadcn
- [ ] Используется синтаксис Svelte 5 (`{@render children?.()}`)
- [ ] Labels связаны с inputs через `for` и `id`

