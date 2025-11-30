<script lang="ts">
	import { config } from '$lib/config.js';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		upload: { file: File };
		error: { message: string };
	}>();

	let isDragging = false;
	let fileInput: HTMLInputElement;

	const acceptedTypes = [
		...config.supportedFileTypes.documents,
		...config.supportedFileTypes.spreadsheets,
		...config.supportedFileTypes.images
	].join(',');

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

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			handleFile(target.files[0]);
		}
	}

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

	function openFileDialog() {
		fileInput?.click();
	}
</script>

<div
	class="file-upload"
	class:dragging={isDragging}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
	role="button"
	tabindex="0"
	on:click={openFileDialog}
	on:keydown={(e) => e.key === 'Enter' && openFileDialog()}
>
	<input
		type="file"
		bind:this={fileInput}
		accept={acceptedTypes}
		on:change={handleFileSelect}
		style="display: none;"
	/>

	<div class="upload-content">
		<div class="upload-icon">📁</div>
		<p class="upload-text">
			{isDragging ? 'Отпустите файл для загрузки' : 'Перетащите файл сюда или нажмите для выбора'}
		</p>
		<p class="upload-hint">
			Поддерживаются: PDF, DOCX, XLSX, PNG, JPG, JPEG (до {config.maxFileSizeMB} МБ)
		</p>
	</div>
</div>

<style>
	.file-upload {
		border: 2px dashed var(--color-border);
		border-radius: var(--border-radius);
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--color-background);
	}

	.file-upload:hover {
		border-color: var(--color-primary);
		background: var(--color-background-hover);
	}

	.file-upload.dragging {
		border-color: var(--color-primary);
		background: var(--color-background-active);
	}

	.upload-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.upload-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.upload-text {
		font-size: 1rem;
		font-weight: 500;
		margin: 0;
		color: var(--color-text);
	}

	.upload-hint {
		font-size: 0.875rem;
		margin: 0;
		color: var(--color-text-secondary);
	}
</style>
