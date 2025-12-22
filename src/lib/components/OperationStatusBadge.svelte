<script lang="ts">
	import type { ProcessingOperation } from '$lib/business/types.js';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Accordion from '$lib/components/ui/accordion.svelte';
	import AccordionItem from '$lib/components/ui/accordion-item.svelte';
	import AccordionTrigger from '$lib/components/ui/accordion-trigger.svelte';
	import AccordionContent from '$lib/components/ui/accordion-content.svelte';
	import Dialog from '$lib/components/ui/dialog.svelte';
	import DialogContent from '$lib/components/ui/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog-header.svelte';
	import DialogTitle from '$lib/components/ui/dialog-title.svelte';
	import DialogDescription from '$lib/components/ui/dialog-description.svelte';
	import DialogFooter from '$lib/components/ui/dialog-footer.svelte';
	import { Play, Trash2, Undo2, Archive } from 'lucide-svelte';

	export let operation:
		| ProcessingOperation
		| { task: ProcessingOperation['task']; status: ProcessingOperation['status'] };
	export let applicationId: string | null = null;
	export let onRun: ((task: ProcessingOperation['task']) => Promise<void>) | null = null;
	export let isRunning: boolean = false;
	export let onToggleDelete: ((operationId: string, deleted: boolean) => Promise<void>) | null = null;
	export let onPurge: ((operationId: string) => Promise<void>) | null = null;

	let isTogglingDelete = false;
	let isPurging = false;
	let purgeModalOpen = false;

	let isExpanded = false;

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function isRealOperation(
		operation: ProcessingOperation | { task: ProcessingOperation['task']; status: ProcessingOperation['status'] }
	): operation is ProcessingOperation {
		return 'id' in operation;
	}

	function getStatusLabel(): string {
		if (!isRealOperation(operation)) {
			return 'Не начато';
		}

		switch (operation.status) {
			case 'started':
				return 'Ожидание';
			case 'completed':
				return 'Завершено';
			case 'failed':
				return 'Ошибка';
		}
	}

	function getOperationTypeLabel(): string {
		switch (operation.task) {
			case 'extractText':
				return 'Извлечение текста';
			case 'resolveProductType':
				return 'Определение типа продукта';
			case 'resolveAbbreviation':
				return 'Формирование аббревиатуры';
			default:
				return operation.task;
		}
	}

	function getStatusVariant(): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (!isRealOperation(operation)) {
			return 'outline';
		}

		switch (operation.status) {
			case 'started':
				return 'secondary';
			case 'completed':
				return 'default';
			case 'failed':
				return 'destructive';
		}
	}

	function getOperationData(): string {
		if (!isRealOperation(operation)) {
			return '';
		}

		if (operation.data) {
			return JSON.stringify(operation.data, null, 2);
		}
		return '';
	}

	function handleRunClick() {
		if (onRun && applicationId) {
			onRun(operation.task);
		}
	}

	async function handleToggleDelete() {
		if (!isRealOperation(operation) || !applicationId || !onToggleDelete) return;

		const isDeleted = operation.deleted || false;
		isTogglingDelete = true;
		try {
			await onToggleDelete(operation.id, !isDeleted);
		} catch (err) {
			console.error('Ошибка при изменении статуса удаления операции:', err);
		} finally {
			isTogglingDelete = false;
		}
	}

	function handleOpenPurgeModal() {
		purgeModalOpen = true;
	}

	function handleClosePurgeModal() {
		purgeModalOpen = false;
	}

	async function handlePurge() {
		if (!isRealOperation(operation) || !applicationId || !onPurge) return;

		isPurging = true;
		try {
			await onPurge(operation.id);
			purgeModalOpen = false;
		} catch (err) {
			console.error('Ошибка при очистке операции:', err);
		} finally {
			isPurging = false;
		}
	}

	function canRunOperation(): boolean {
		if (!applicationId || !onRun) return false;
		// Можно запустить, если операция еще не начата
		if (!isRealOperation(operation)) return true;
		// Можно запустить повторно, если операция завершилась с ошибкой
		// Или если операция все еще выполняется (можно перезапустить)
		return operation.status === 'failed' || operation.status === 'started';
	}

	function getRunButtonLabel(): string {
		if (isRunning) {
			return 'Запуск...';
		}
		if (!isRealOperation(operation)) {
			return 'Запустить';
		}
		if (operation.status === 'failed') {
			return 'Повторить';
		}
		return 'Запустить';
	}

	$: hasContent = isRealOperation(operation) && !!operation.data;
	$: canRun = canRunOperation();
</script>

<div class="operation-badge">
	<div class="badge-header">
		<div class="badge-label">
			<span class="operation-type">{getOperationTypeLabel()}:</span>
			<Badge variant={getStatusVariant()}>
				{getStatusLabel()}
			</Badge>
		</div>
		<div class="badge-actions">
			{#if canRun}
				<Button
					size="sm"
					variant="default"
					disabled={isRunning || isTogglingDelete || isPurging}
					onclick={handleRunClick}
					title="Запустить операцию обработки"
					aria-label="Запустить операцию обработки"
				>
					<Play class="mr-2 h-4 w-4" />
					{getRunButtonLabel()}
				</Button>
			{/if}
			{#if isRealOperation(operation) && onToggleDelete && applicationId && onPurge}
				{#if operation.deleted || false}
					<Button
						variant="secondary"
						size="sm"
						onclick={handleToggleDelete}
						disabled={isRunning || isTogglingDelete || isPurging}
						title="Вернуть операцию из удаленных. Операция снова появится в списке."
						aria-label="Вернуть операцию из удаленных"
					>
						<Undo2 class="mr-2 h-4 w-4" />
						Вернуть
					</Button>
				{:else}
					<Button
						variant="secondary"
						size="sm"
						onclick={handleToggleDelete}
						disabled={isRunning || isTogglingDelete || isPurging}
						title="Пометить операцию как удаленную. Операция скроется, но останется в базе данных."
						aria-label="Пометить операцию как удаленную"
					>
						<Archive class="mr-2 h-4 w-4" />
						Архив
					</Button>
				{/if}
				<Button
					variant="destructive"
					size="sm"
					onclick={handleOpenPurgeModal}
					disabled={isRunning || isTogglingDelete || isPurging}
					title="Полностью удалить операцию из базы данных. Это действие необратимо."
					aria-label="Полностью удалить операцию"
				>
					<Trash2 class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	</div>
	{#if hasContent}
		<Accordion type="single" collapsible>
			<AccordionItem value="details">
				<AccordionTrigger>Детали операции</AccordionTrigger>
				<AccordionContent>
					<pre class="result-json">{getOperationData()}</pre>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	{/if}

	{#if isRealOperation(operation) && onPurge}
		<Dialog bind:open={purgeModalOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Подтверждение очистки операции</DialogTitle>
					<DialogDescription>
						Вы уверены, что хотите полностью удалить эту операцию? Это действие необратимо.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onclick={handleClosePurgeModal}>
						Отмена
					</Button>
					<Button variant="destructive" onclick={handlePurge}>
						Очистить
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	{/if}
</div>

<style>
	.operation-badge {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		margin-bottom: 0.75rem;
		overflow: hidden;
		transition: box-shadow 0.2s ease;
	}

	.operation-badge:hover {
		box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.1);
	}

	.badge-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
	}

	.badge-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
	}

	.badge-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 0.5rem;
		flex-wrap: nowrap;
	}

	.badge-actions :global(button) {
		flex-shrink: 0;
		white-space: nowrap;
	}

	.operation-type {
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.result-json {
		margin: 0;
		padding: 0;
		font-size: 0.875rem;
		font-family: 'IBM Plex Mono', 'Courier New', monospace;
		color: hsl(var(--foreground));
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-x: auto;
		background: hsl(var(--muted));
		padding: 1rem;
		border-radius: 0.5rem;
	}
</style>
