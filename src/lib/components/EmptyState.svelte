<script lang="ts">
	import Card from '$lib/components/ui/card.svelte';
	import { FileText } from 'lucide-svelte';
	
	export let message: string;
	export let icon: string | undefined = undefined;
</script>

<div class="flex items-center justify-center min-h-[12.5rem]">
	<Card>
		<div class="flex flex-col items-center justify-center text-center gap-4 p-8">
			{#if icon}
				<div class="opacity-50 text-muted-foreground">
					<FileText size={32} />
				</div>
			{/if}
			<p class="m-0 text-muted-foreground">{message}</p>
		</div>
	</Card>
</div>

