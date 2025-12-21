<script lang="ts">
	import { getApplicationStatusInfo, getFileInfo, fetchApplication, extractText, resolveProductType, resolveAbbreviation } from '$lib/business/rest.js';
	import type { ApplicationStatusInfo, ProcessingOperation } from '$lib/business/types.js';
	import EmptyState from './EmptyState.svelte';
	import OperationStatusBadge from './OperationStatusBadge.svelte';
	import { Effect, Option } from 'effect';
	import type { FileInfo } from '$lib/storage/files.js';
	import { Button, Form, FormGroup, TextInput, TextArea, Tile, Tag, InlineNotification, Modal } from 'carbon-components-svelte';
	import { Renew, TrashCan, Undo, Archive } from 'carbon-icons-svelte';

	export let applicationId: string | null = null;

	let statusInfo: ApplicationStatusInfo | null = null;
	let error: string | null = null;
	let fileInfo: FileInfo | null = null;
	let isRefreshing = false;
	let isPurging = false;
	let isTogglingDelete = false;
	let purgeModalOpen = false;
	let runningOperations = new Set<ProcessingOperation['task']>();
	let currentApplicationId: string | null = null;

	$: if (applicationId !== currentApplicationId) {
		// При смене заявки сразу очищаем старые данные
		currentApplicationId = applicationId;
		statusInfo = null;
		fileInfo = null;
		error = null;
		runningOperations.clear();
		
		// Загружаем новую заявку с операциями
		if (applicationId) {
			loadApplication();
		}
	}


	async function loadApplication() {
		if (!applicationId) return;
		
		// Проверяем, что applicationId не изменился во время загрузки
		const loadingId = applicationId;

		error = null;
		
		// Загружаем данные заявки, ВСЕГДА включая операции
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				// getApplicationStatusInfo загружает заявку и ВСЕ операции
				const status = yield* getApplicationStatusInfo(loadingId);
				const file = yield* Effect.option(getFileInfo(loadingId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявки';
			// Очищаем данные только если это та же заявка
			if (applicationId === loadingId) {
				statusInfo = null;
				fileInfo = null;
			}
			return null;
		});
		
		if (result) {
			// Сохраняем данные заявки с операциями
			// result.status.operations содержит все загруженные операции (может быть пустым массивом)
			statusInfo = {
				...result.status,
				operations: result.status.operations || [] // Гарантируем, что operations всегда массив
			};
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
		}
	}



	async function handleRefresh() {
		if (!applicationId) return;

		isRefreshing = true;
		error = null;
		
		// Обновляем операции через fetchApplication
		await Effect.runPromise(
			fetchApplication(applicationId)
		).catch((err) => {
			console.warn('Ошибка при обновлении операций:', err);
		});
		
		// Загружаем обновленные данные
		await loadApplication();
		isRefreshing = false;
	}

	async function handleToggleDelete(checked: boolean) {
		if (!applicationId || !statusInfo) return;

		isTogglingDelete = true;
		error = null;

		try {
			const response = await fetch(`/api/applications/${applicationId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ deleted: checked })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при изменении статуса удаления');
			}

			// Обновляем локальное состояние
			if (statusInfo) {
				statusInfo = {
					...statusInfo,
					application: {
						...statusInfo.application,
						deleted: checked
					}
				};
			}

			// Обновляем данные после изменения
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при изменении статуса удаления';
			// Откатываем изменение в UI
			await loadApplication();
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
		if (!applicationId) return;

		isPurging = true;
		error = null;

		try {
			const response = await fetch(`/api/applications/${applicationId}/purge`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при очистке заявки');
			}

			// Очищаем данные и сбрасываем applicationId
			statusInfo = null;
			fileInfo = null;
			applicationId = null;
			purgeModalOpen = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при очистке заявки';
		} finally {
			isPurging = false;
		}
	}

	async function handleRunOperation(task: ProcessingOperation['task']) {
		if (!applicationId) return;

		runningOperations.add(task);
		error = null;

		let operationEffect: Effect.Effect<void, Error>;
		if (task === 'extractText') {
			operationEffect = extractText(applicationId);
		} else if (task === 'resolveProductType') {
			operationEffect = resolveProductType(applicationId);
		} else if (task === 'resolveAbbreviation') {
			// Для resolveAbbreviation нужен technicalSpecId, но пока используем пустую строку
			// TODO: нужно будет передавать technicalSpecId как-то иначе
			error = 'Для формирования аббревиатуры требуется техническое условие';
			runningOperations.delete(task);
			return;
		} else {
			error = 'Неизвестная операция';
			runningOperations.delete(task);
			return;
		}

		await Effect.runPromise(operationEffect).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка выполнения операции';
		});
		
		// Обновляем данные после операции
		await loadApplication();
		runningOperations.delete(task);
	}

	async function handleToggleOperationDelete(operationId: string, deleted: boolean) {
		if (!applicationId) return;

		try {
			const response = await fetch(`/api/applications/${applicationId}/operations/${operationId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ deleted })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при изменении статуса удаления операции');
			}

			// Обновляем данные после изменения
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при изменении статуса удаления операции';
			// Откатываем изменение в UI
			await loadApplication();
		}
	}

	async function handlePurgeOperation(operationId: string) {
		if (!applicationId) return;

		try {
			const response = await fetch(`/api/applications/${applicationId}/operations/${operationId}/purge`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при очистке операции');
			}

			// Обновляем данные после очистки
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при очистке операции';
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Б';
		const k = 1024;
		const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function getStatusText(status: ApplicationStatusInfo['status']): string {
		switch (status) {
			case 'completed':
				return 'Обработана';
			case 'processing':
				return 'Обрабатывается';
			case 'failed':
				return 'Ошибка';
			case 'nothing':
			default:
				return 'Новая';
		}
	}

	function getFinalAbbreviation(): string | null {
		if (!statusInfo?.application?.abbreviation) return null;
		return statusInfo.application.abbreviation.abbreviation || null;
	}

	function isRealOperation(
		operation: ProcessingOperation | { task: ProcessingOperation['task']; status: ProcessingOperation['status'] }
	): operation is ProcessingOperation {
		return 'id' in operation;
	}

	// Получаем все операции, включая те, которых еще нет
	// Реактивная переменная, которая обновляется при изменении statusInfo
	$: allOperations = (() => {
		const operationTasks: ProcessingOperation['task'][] = ['extractText', 'resolveProductType', 'resolveAbbreviation'];
		const operations = statusInfo?.operations || [];
		const operationsMap = new Map(operations.map((op) => [op.task, op]));
		
		return operationTasks.map((task) => {
			const existing = operationsMap.get(task);
			if (existing) {
				return existing;
			}
			// Возвращаем "пустую" операцию для отображения
			return { task, status: 'started' as ProcessingOperation['status'] };
		});
	})();
</script>

<div class="application-details">
	{#if !applicationId}
		<EmptyState message="Выберите заявку для просмотра" />
	{:else if error && !statusInfo}
		<div class="error-section">
			<InlineNotification
				kind="error"
				title="Ошибка"
				subtitle={error}
				hideCloseButton={false}
				on:close={() => error = null}
			/>
		</div>
	{:else if statusInfo}
		<div class="details-content">
			<div class="header">
				<h2>Детали заявки</h2>
				<div class="header-actions">
					<Button
						kind="ghost"
						size="small"
						on:click={handleRefresh}
						disabled={isRefreshing || isPurging || isTogglingDelete}
						icon={Renew}
						title="Обновить данные заявки и статусы операций"
						aria-label="Обновить данные заявки и статусы операций"
					>
						{isRefreshing ? 'Обновление...' : 'Обновить'}
					</Button>
					{#if statusInfo.application.deleted || false}
						<Button
							kind="secondary"
							size="small"
							on:click={() => handleToggleDelete(false)}
							disabled={isRefreshing || isPurging || isTogglingDelete}
							icon={Undo}
							title="Вернуть заявку из удаленных. Заявка снова появится в списке."
							aria-label="Вернуть заявку из удаленных"
						>
							Вернуть
						</Button>
					{:else}
						<Button
							kind="secondary"
							size="small"
							on:click={() => handleToggleDelete(true)}
							disabled={isRefreshing || isPurging || isTogglingDelete}
							icon={Archive}
							title="Пометить заявку как удаленную. Заявка скроется из списка, но останется в базе данных."
							aria-label="Пометить заявку как удаленную"
						>
							Архив
						</Button>
					{/if}
					<Button
						kind="danger"
						size="small"
						on:click={handleOpenPurgeModal}
						disabled={isRefreshing || isPurging || isTogglingDelete}
						icon={TrashCan}
						title="Полностью удалить заявку и все связанные файлы из системы. Это действие необратимо."
						aria-label="Полностью удалить заявку"
						hideTooltip={true}
					>
					</Button>
				</div>
			</div>

			{#if error}
				<div class="error-section">
					<InlineNotification
						kind="error"
						title="Ошибка"
						subtitle={error}
						hideCloseButton={false}
						on:close={() => error = null}
					/>
				</div>
			{/if}

			<Tile class="section">
				<h3>Основная информация</h3>
				<Form>
					{#if statusInfo.application.productType}
						<FormGroup>
							<TextInput
								id="product-type-display"
								labelText="Тип продукции:"
								value={statusInfo.application.productType.type}
								readonly
							/>
						</FormGroup>
					{/if}
					<FormGroup>
						<TextInput
							id="filename-display"
							labelText="Название файла:"
							value={statusInfo.application.originalFilename}
							readonly
						/>
					</FormGroup>
					<FormGroup>
						<TextInput
							id="arrival-date-display"
							labelText="Дата загрузки:"
							value={formatDate(statusInfo.application.uploadDate)}
							readonly
						/>
					</FormGroup>
					<FormGroup>
						<label for="status-display" class="bx--label">Статус:</label>
						{@const statusType = statusInfo.status === 'completed' ? 'green' : statusInfo.status === 'failed' ? 'red' : statusInfo.status === 'processing' ? 'blue' : 'gray'}
						<Tag id="status-display" type={statusType} size="sm">
							{getStatusText(statusInfo.status)}
						</Tag>
					</FormGroup>
					<FormGroup>
						<label class="bx--label">Статусы операций:</label>
						<div class="operations-list">
							{#each allOperations as operationOrPlaceholder}
								<OperationStatusBadge 
									operation={operationOrPlaceholder} 
									applicationId={applicationId}
									onRun={handleRunOperation}
									isRunning={runningOperations.has(operationOrPlaceholder.task)}
									onToggleDelete={isRealOperation(operationOrPlaceholder) ? (id, deleted) => handleToggleOperationDelete(id, deleted) : null}
									onPurge={isRealOperation(operationOrPlaceholder) ? (id) => handlePurgeOperation(id) : null}
								/>
							{/each}
						</div>
					</FormGroup>
				</Form>
			</Tile>

			<Tile class="section">
				<h3>Информация о файле</h3>
				{#if fileInfo}
					<Form>
						<FormGroup>
							<TextInput
								labelText="Имя файла:"
								value={fileInfo.name}
								readonly
							/>
						</FormGroup>
						<FormGroup>
							<TextInput
								labelText="Тип файла:"
								value={fileInfo.type}
								readonly
							/>
						</FormGroup>
						<FormGroup>
							<TextInput
								labelText="Количество страниц:"
								value={fileInfo.pageCount.toString()}
								readonly
							/>
						</FormGroup>
						{#if fileInfo.extractedText}
							<FormGroup>
								<label class="bx--label">Извлеченный текст:</label>
								<TextArea
									value={fileInfo.extractedText.substring(0, 200) + (fileInfo.extractedText.length > 200 ? `... (еще ${fileInfo.extractedText.length - 200} символов)` : '')}
									readonly
									rows={5}
									class="extracted-text-preview"
								/>
							</FormGroup>
						{/if}
					</Form>
				{:else}
					<p>Информация о файле недоступна</p>
				{/if}
			</Tile>

			{#if statusInfo.status === 'completed' || statusInfo.status === 'processing'}
				<Tile class="section final-abbreviation">
					<h3>Результаты обработки</h3>
					<FormGroup>
						<label for="final-abbreviation" class="bx--label">Финальное обозначение продукции:</label>
						{#if getFinalAbbreviation()}
							<div id="final-abbreviation" class="abbreviation-value">{getFinalAbbreviation()}</div>
						{:else}
							<div id="final-abbreviation" class="abbreviation-empty">Аббревиатура не сформирована</div>
						{/if}
					</FormGroup>
				</Tile>
			{/if}
		</div>
	{/if}

	<Modal
		open={purgeModalOpen}
		on:close={handleClosePurgeModal}
		modalHeading="Подтверждение очистки заявки"
		primaryButtonText="Очистить"
		secondaryButtonText="Отмена"
		danger={true}
		on:click:button--primary={handlePurge}
		on:click:button--secondary={handleClosePurgeModal}
	>
		<p>
			Вы уверены, что хотите полностью удалить эту заявку? Это действие удалит заявку из базы данных и все связанные файлы. Это действие необратимо.
		</p>
	</Modal>
</div>

<style>
	.application-details {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--cds-layer);
		overflow-y: auto;
	}

	.error-section {
		padding: 1rem;
	}

	.details-content {
		padding: 1.5rem;
	}

	.header {
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: nowrap;
	}

	:global(.header-actions .bx--btn) {
		flex-shrink: 0;
		white-space: nowrap;
	}

	.header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--cds-text-primary);
	}

	:global(.section.bx--tile) {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--cds-border-subtle);
	}

	:global(.section.bx--tile:last-child) {
		border-bottom: none;
	}

	:global(.section.bx--tile h3) {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--cds-text-primary);
	}

	.operations-list {
		width: 100%;
		margin-top: 0.5rem;
	}

	.final-abbreviation {
		background: var(--cds-support-success-inverse);
		border: 2px solid var(--cds-support-success);
	}

	.abbreviation-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--cds-support-success);
		margin-top: 0.5rem;
	}

	.abbreviation-empty {
		font-size: 1rem;
		color: var(--cds-text-secondary);
		margin-top: 0.5rem;
		font-style: italic;
	}

	:global(.extracted-text-preview.bx--text-area) {
		background: var(--cds-field);
		border: 1px solid var(--cds-border-subtle);
		font-size: 0.875rem;
		line-height: 1.5;
		max-height: 12.5rem;
		overflow-y: auto;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
