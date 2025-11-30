<script lang="ts">
	import type { ProcessingOperation } from '$lib/storage/types.js';

	export let operation: ProcessingOperation | { type: ProcessingOperation['type']; status: 'not_started' };

	let isExpanded = false;

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function isRealOperation(): operation is ProcessingOperation {
		return 'id' in operation;
	}

	function getStatusLabel(): string {
		if (!isRealOperation()) {
			return 'Не начато';
		}
		
		switch (operation.status) {
			case 'pending':
				return 'Ожидание';
			case 'running':
				return 'Выполняется';
			case 'completed':
				return 'Завершено';
			case 'failed':
				return 'Ошибка';
			default:
				return operation.status;
		}
	}

	function getOperationTypeLabel(): string {
		switch (operation.type) {
			case 'ocr':
				return 'OCR';
			case 'llm_product_type':
				return 'LLM Тип продукта';
			case 'llm_abbreviation':
				return 'LLM Аббревиатура';
			default:
				return operation.type;
		}
	}

	function getStatusColor(): string {
		if (!isRealOperation()) {
			return 'var(--color-border)';
		}
		
		switch (operation.status) {
			case 'pending':
				return 'var(--color-status-pending)';
			case 'running':
				return 'var(--color-status-running)';
			case 'completed':
				return 'var(--color-status-completed)';
			case 'failed':
				return 'var(--color-status-failed)';
			default:
				return 'var(--color-border)';
		}
	}

	function getStatusTextColor(): string {
		if (!isRealOperation()) {
			return 'var(--color-text-secondary)';
		}
		
		switch (operation.status) {
			case 'pending':
				return 'var(--color-status-pending-text)';
			case 'running':
				return 'var(--color-status-running-text)';
			case 'completed':
				return 'var(--color-status-completed-text)';
			case 'failed':
				return 'var(--color-status-failed-text)';
			default:
				return 'var(--color-text)';
		}
	}

	function getResultData(): string {
		if (!isRealOperation()) {
			return '';
		}
		
		if (operation.result) {
			return JSON.stringify(operation.result, null, 2);
		}
		if (operation.error) {
			return JSON.stringify(operation.error, null, 2);
		}
		return '';
	}

	$: hasContent = isRealOperation() && !!(operation.result || operation.error);
</script>

<div class="operation-badge" style="--status-color: {getStatusColor()}; --status-text-color: {getStatusTextColor()};">
	<div class="badge-header" class:clickable={hasContent} on:click={hasContent ? toggleExpanded : undefined} role={hasContent ? 'button' : undefined} tabindex={hasContent ? 0 : undefined} on:keydown={(e) => hasContent && e.key === 'Enter' && toggleExpanded()}>
		<div class="badge-label">
			<span class="operation-type">{getOperationTypeLabel()}:</span>
			<span class="status-badge">
				{getStatusLabel()}
			</span>
		</div>
		{#if hasContent}
			<button class="toggle-button" class:expanded={isExpanded} aria-label={isExpanded ? 'Свернуть' : 'Развернуть'} on:click|stopPropagation={toggleExpanded}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{/if}
	</div>
	{#if isExpanded && hasContent}
		<div class="badge-content">
			<pre class="result-json">{getResultData()}</pre>
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
		transition: transform 0.2s ease, color 0.2s ease;
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
