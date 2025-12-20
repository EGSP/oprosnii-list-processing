<script lang="ts">
	import { config } from '$lib/config.js';
	import { createEventDispatcher } from 'svelte';
	import { Tile } from 'carbon-components-svelte';
	import { Upload } from 'carbon-icons-svelte';

	const dispatch = createEventDispatcher<{
		upload: { file: File };
		error: { message: string };
	}>();

	const acceptedTypes = [
		...config.supportedFileTypes.documents,
		...config.supportedFileTypes.spreadsheets,
		...config.supportedFileTypes.images
	].join(',');

	let fileInput: HTMLInputElement;
	let isDragging = false;

	function handleFile(file: File) {
		// Валидация типа файла
		if (!acceptedTypes.includes(file.type)) {
			dispatch('error', {
				message: `Неподдерживаемый тип файла: ${file.type}. Поддерживаются: PDF, DOCX, XLSX, PNG, JPG, JPEG`
			});
			return;
		}

		// Валидация размера файла
		if (file.size > config.maxFileSizeBytes) {
			dispatch('error', {
				message: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(2)} МБ. Максимальный размер: ${config.maxFileSizeMB} МБ`
			});
			return;
		}

		dispatch('upload', { file });
	}

	function handleFileInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			handleFile(target.files[0]);
			// Сбрасываем значение input, чтобы можно было загрузить тот же файл снова
			target.value = '';
		}
	}

	function openFileDialog() {
		fileInput?.click();
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	}
</script>

<div class="file-upload-container" class:dragging={isDragging}>
	<Tile>
		<div
			class="upload-content"
			role="button"
			tabindex="0"
			on:click={openFileDialog}
			on:keydown={(e) => e.key === 'Enter' && openFileDialog()}
			on:dragover={handleDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleDrop}
		>
			<Upload size={32} class="upload-icon" />
			<p class="upload-text">
				Перетащите файл сюда или нажмите для выбора
			</p>
			<p class="upload-hint">
				Поддерживаются: PDF, DOCX, XLSX, PNG, JPG, JPEG (до {config.maxFileSizeMB} МБ)
			</p>
		</div>
		<input
			type="file"
			bind:this={fileInput}
			accept={acceptedTypes}
			on:change={handleFileInputChange}
			style="display: none;"
		/>
	</Tile>
</div>

<style>
	.file-upload-container {
		cursor: pointer;
	}

	:global(.file-upload-container .bx--tile) {
		border: 2px dashed var(--cds-border-subtle);
		border-radius: 0.25rem;
		transition: all 0.2s ease;
	}

	.file-upload-container:hover :global(.bx--tile) {
		border-color: var(--cds-link-primary);
		background: var(--cds-layer-hover);
	}

	.file-upload-container.dragging :global(.bx--tile) {
		border-color: var(--cds-link-primary);
		background: var(--cds-layer-selected);
	}

	.upload-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
		text-align: center;
	}

	.upload-icon {
		opacity: 0.5;
		color: var(--cds-icon-secondary);
		margin-bottom: 0.5rem;
	}

	.upload-text {
		font-size: 1rem;
		font-weight: 500;
		margin: 0;
		color: var(--cds-text-primary);
	}

	.upload-hint {
		font-size: 0.875rem;
		margin: 0;
		color: var(--cds-text-secondary);
	}
</style>
