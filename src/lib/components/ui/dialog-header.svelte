<script lang="ts">
	import { cn } from "$lib/utils/cn";

	interface $$Props {
		class?: string;
	}

	let { class: className = "" }: $$Props = $props();
</script>

<div class={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}>
	<slot />
</div>

