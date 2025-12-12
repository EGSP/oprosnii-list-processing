<script lang="ts">
	import type { ProcessingOperation } from '$lib/business/types.js';

	export let operation:
		| ProcessingOperation
		| { task: ProcessingOperation['task']; status: ProcessingOperation['status'] };
	export let applicationId: string | null = null;
	export let onRun: ((task: ProcessingOperation['task']) => Promise<void>) | null = null;
	export let isRunning: boolean = false;

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

	function getStatusColor(): string {
		if (!isRealOperation(operation)) {
			return 'var(--color-border)';
		}

		switch (operation.status) {
			case 'started':
				return 'var(--color-status-pending)';
			case 'completed':
				return 'var(--color-status-completed)';
			case 'failed':
				return 'var(--color-status-failed)';
		}
	}

	function getStatusTextColor(): string {
		if (!isRealOperation(operation)) {
			return 'var(--color-text-secondary)';
		}

		switch (operation.status) {
			case 'started':
				return 'var(--color-status-pending-text)';
			case 'completed':
				return 'var(--color-status-completed-text)';
			case 'failed':
				return 'var(--color-status-failed-text)';
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

	function handleRunClick(event: MouseEvent) {
		event.stopPropagation();
		if (onRun && applicationId) {
			onRun(operation.task);
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

<div
	class="operation-badge"
	style="--status-color: {getStatusColor()}; --status-text-color: {getStatusTextColor()};"
>
	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<div
		class="badge-header"
		class:clickable={hasContent}
		on:click={hasContent ? toggleExpanded : undefined}
		role={hasContent ? 'button' : undefined}
		tabindex={hasContent ? 0 : undefined}
		on:keydown={(e) => hasContent && e.key === 'Enter' && toggleExpanded()}
	>
		<div class="badge-label">
			<span class="operation-type">{getOperationTypeLabel()}:</span>
			<span class="status-badge">
				{getStatusLabel()}
			</span>
		</div>
		<div class="badge-actions">
			{#if canRun}
				<button
					class="run-button"
					disabled={isRunning}
					on:click|stopPropagation={handleRunClick}
					title="Запустить операцию"
				>
					{getRunButtonLabel()}
				</button>
			{/if}
			{#if hasContent}
				<button
					class="toggle-button"
					class:expanded={isExpanded}
					aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
					on:click|stopPropagation={toggleExpanded}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M4 6L8 10L12 6"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
	{#if isExpanded && hasContent}
		<div class="badge-content">
			<pre class="result-json">{getOperationData()}</pre>
		</div>
	{/if}
</div>

<style>
	.operation-badge {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--status-color);
		border-radius: var(--border-radius);
		margin-bottom: 0.75rem;
		overflow: hidden;
		transition: box-shadow 0.2s ease;
	}

	.operation-badge:hover {
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.badge-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
	}

	.badge-header.clickable {
		cursor: pointer;
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
	}

	.run-button {
		padding: 0.375rem 0.75rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--border-radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease, opacity 0.2s ease;
		white-space: nowrap;
	}

	.run-button:hover:not(:disabled) {
		background: var(--color-primary-dark);
	}

	.run-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.operation-type {
		font-weight: 500;
		color: var(--color-text);
	}

	.status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-sm);
		background: var(--status-color);
		color: var(--status-text-color);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.toggle-button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		transition:
			transform 0.2s ease,
			color 0.2s ease;
		margin-left: 0.5rem;
	}

	.toggle-button:hover {
		color: var(--color-text);
	}

	.toggle-button.expanded {
		transform: rotate(180deg);
	}

	.badge-content {
		border-top: 1px solid var(--color-border);
		padding: 1rem;
		background: var(--color-code-bg);
	}

	.result-json {
		margin: 0;
		padding: 0;
		font-size: 0.875rem;
		font-family: 'Courier New', monospace;
		color: var(--color-text);
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-x: auto;
	}
</style>
