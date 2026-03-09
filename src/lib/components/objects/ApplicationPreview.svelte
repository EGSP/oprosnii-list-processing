<script lang="ts">
	import type { Application } from '$lib/business/types';
	import { getFileCategory } from '$lib/storage/filesUtils';


	let { application }: { application: Application } = $props();

	let fileUrl = $derived(`/api/applications/${application.id}/file`);

	let fileCategory = $derived(getFileCategory(application.originalFilename));
</script>

{#if fileCategory === 'image'}
	<img
		src={fileUrl}
		alt={application.originalFilename}
		style="max-width: 100%; max-height: 80vh; object-fit: contain;"
	/>
{:else if fileCategory === 'pdf'}
	<iframe
		src={fileUrl}
		title={`Предпросмотр ${application.originalFilename}`}
		style="width: 100%; height: 80vh; border: none;"
	></iframe>
{:else}
	<p>Предпросмотр для этого типа файла пока не поддержан.</p>
{/if}
