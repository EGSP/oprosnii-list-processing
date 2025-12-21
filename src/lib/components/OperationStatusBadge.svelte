<script lang="ts">
	import type { ProcessingOperation } from '$lib/business/types.js';
	import { Tag, Button, Accordion, AccordionItem, Modal } from 'carbon-components-svelte';
	import { ChevronDown, Checkmark, Error, Time, Play, TrashCan, Undo, Archive } from 'carbon-icons-svelte';

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

	function getStatusType(): 'gray' | 'blue' | 'green' | 'red' {
		if (!isRealOperation(operation)) {
			return 'gray';
		}

		switch (operation.status) {
			case 'started':
				return 'blue';
			case 'completed':
				return 'green';
			case 'failed':
				return 'red';
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
			<Tag type={getStatusType()} size="sm">
				{getStatusLabel()}
			</Tag>
		</div>
		<div class="badge-actions">
			{#if canRun}
				<Button
					size="small"
					kind="primary"
					disabled={isRunning || isTogglingDelete || isPurging}
					on:click={handleRunClick}
					icon={Play}
					title="Запустить операцию обработки"
					aria-label="Запустить операцию обработки"
				>
					{getRunButtonLabel()}
				</Button>
			{/if}
			{#if isRealOperation(operation) && onToggleDelete && applicationId && onPurge}
				{#if operation.deleted || false}
					<Button
						kind="secondary"
						size="small"
						on:click={handleToggleDelete}
						disabled={isRunning || isTogglingDelete || isPurging}
						icon={Undo}
						title="Вернуть операцию из удаленных. Операция снова появится в списке."
						aria-label="Вернуть операцию из удаленных"
					>
						Вернуть
					</Button>
				{:else}
					<Button
						kind="secondary"
						size="small"
						on:click={handleToggleDelete}
						disabled={isRunning || isTogglingDelete || isPurging}
						icon={Archive}
						title="Пометить операцию как удаленную. Операция скроется, но останется в базе данных."
						aria-label="Пометить операцию как удаленную"
					>
						Архив
					</Button>
				{/if}
				<Button
					kind="danger"
					size="small"
					on:click={handleOpenPurgeModal}
					disabled={isRunning || isTogglingDelete || isPurging}
					icon={TrashCan}
					title="Полностью удалить операцию из базы данных. Это действие необратимо."
					aria-label="Полностью удалить операцию"
					hideTooltip={true}
				>
				</Button>
			{/if}
		</div>
	</div>
	{#if hasContent}
		<Accordion>
			<AccordionItem
				title="Детали операции"
				bind:open={isExpanded}
			>
				<pre class="result-json">{getOperationData()}</pre>
			</AccordionItem>
		</Accordion>
	{/if}

	{#if isRealOperation(operation) && onPurge}
		<Modal
			open={purgeModalOpen}
			on:close={handleClosePurgeModal}
			modalHeading="Подтверждение очистки операции"
			primaryButtonText="Очистить"
			secondaryButtonText="Отмена"
			danger={true}
			on:click:button--primary={handlePurge}
			on:click:button--secondary={handleClosePurgeModal}
		>
			<p>
				Вы уверены, что хотите полностью удалить эту операцию? Это действие необратимо.
			</p>
		</Modal>
	{/if}
</div>

<style>
	.operation-badge {
		background: var(--cds-layer);
		border: 1px solid var(--cds-border-subtle);
		border-radius: 0.25rem;
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

	:global(.badge-actions .bx--btn) {
		flex-shrink: 0;
		white-space: nowrap;
	}

	.operation-type {
		font-weight: 500;
		color: var(--cds-text-primary);
	}

	.result-json {
		margin: 0;
		padding: 0;
		font-size: 0.875rem;
		font-family: 'IBM Plex Mono', 'Courier New', monospace;
		color: var(--cds-text-primary);
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-x: auto;
		background: var(--cds-layer-01);
		padding: 1rem;
		border-radius: 0.25rem;
	}
</style>
