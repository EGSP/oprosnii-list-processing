<script lang="ts">
	import { cn } from "$lib/utils/cn";

	interface $$Props {
		class?: string;
	}

	let { class: className = "" }: $$Props = $props();
</script>

<div class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}>
	<slot />
</div>

