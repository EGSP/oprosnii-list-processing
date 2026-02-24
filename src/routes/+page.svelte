<script lang="ts">
	import ApplicationList from '$lib/components/ApplicationList.svelte';
	import type { Application } from '$lib/business/types.js';

	let selectedApplication: Application | null = null;

	function handleSelect(application: Application) {
		selectedApplication = application;
	}

	function handleUpload(application: Application) {
		selectedApplication =application;
	}
</script>

<div class="main-layout">
	<div class="left-panel">
		<ApplicationList select={handleSelect} upload={handleUpload} />
	</div>
	<div class="right-panel">
		<!-- <ApplicationDetails applicationId={selectedApplication?.id || null} /> -->
	</div>
</div>

<style>
	.main-layout {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: hsl(var(--background));
	}

	.left-panel {
		width: 20rem;
		min-width: 16rem;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid hsl(var(--border));
	}

	.right-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	@media (max-width: 48rem) {
		.main-layout {
			flex-direction: column;
		}

		.left-panel {
			width: 100%;
			height: 40vh;
			border-right: none;
			border-bottom: 1px solid hsl(var(--border));
		}

		.right-panel {
			height: 60vh;
		}
	}
</style>
