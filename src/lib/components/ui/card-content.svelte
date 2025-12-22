<script lang="ts">
	import { cn } from "$lib/utils/cn";

	interface $$Props {
		class?: string;
	}

	let { class: className = "" }: $$Props = $props();
</script>

<div class={cn("p-6 pt-0", className)}>
	<slot />
</div>

