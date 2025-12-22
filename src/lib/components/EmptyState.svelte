<script lang="ts">
	import Card from '$lib/components/ui/card.svelte';
	import { FileText } from 'lucide-svelte';
	
	export let message: string;
	export let icon: string | undefined = undefined;
</script>

<div class="empty-state">
	<Card>
		<div class="empty-state-content">
			{#if icon}
				<div class="icon">
					<FileText size={32} />
				</div>
			{/if}
			<p class="message">{message}</p>
		</div>
	</Card>
</div>

<style>
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 12.5rem;
	}

	.empty-state-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 1rem;
		padding: 2rem;
	}

	.icon {
		opacity: 0.5;
		color: hsl(var(--muted-foreground));
	}

	.message {
		margin: 0;
		color: hsl(var(--muted-foreground));
	}
</style>
