<script lang="ts">
	import { config } from '$lib/config.js';
	import { createEventDispatcher } from 'svelte';
	import Card from '$lib/components/ui/card.svelte';
	import { Upload } from 'lucide-svelte';

	let { upload } = $props<{
		upload: (file: File) => void;
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
			// dispatch('error', {
			// 	message: `Неподдерживаемый тип файла: ${file.type}. Поддерживаются: PDF, DOCX, XLSX, PNG, JPG, JPEG`
			// });
			return;
		}

		// Валидация размера файла
		if (file.size > config.maxFileSizeBytes) {
			// dispatch('error', {
			// 	message: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(2)} МБ. Максимальный размер: ${config.maxFileSizeMB} МБ`
			// });
			return;
		}

		upload(file);
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
	<Card>
		<div
			class="flex flex-col items-center gap-1.5 p-4 text-center"
			role="button"
			tabindex="0"
			onclick={openFileDialog}
			onkeydown={(e) => e.key === 'Enter' && openFileDialog()}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			<Upload size={24} class="opacity-50 text-muted-foreground mb-1" />
			<p class="text-sm font-medium m-0 text-foreground">
				Перетащите файл сюда или нажмите для выбора
			</p>
			<p class="text-xs m-0 text-muted-foreground">
				PDF, DOCX, XLSX, PNG, JPG, JPEG (до {config.maxFileSizeMB} МБ)
			</p>
		</div>
		<input
			type="file"
			bind:this={fileInput}
			accept={acceptedTypes}
			onchange={handleFileInputChange}
			style="display: none;"
		/>
	</Card>
</div>

<style>
	.file-upload-container {
		cursor: pointer;
	}

	:global(.file-upload-container div[class*='rounded-none']) {
		border: 1px dashed hsl(var(--border));
	}

	.file-upload-container:hover :global(div[class*='rounded-none']) {
		border-color: hsl(var(--primary));
		background: hsl(var(--accent));
	}

	.file-upload-container.dragging :global(div[class*='rounded-none']) {
		border-color: hsl(var(--primary));
		background: hsl(var(--accent));
	}
</style>
