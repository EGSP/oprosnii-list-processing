<script lang="ts">
	import { getContext } from "svelte";
	import { cn } from "$lib/utils/cn";
	import { X } from "lucide-svelte";
	import type { Snippet } from "svelte";

	interface $$Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children }: $$Props = $props();

	const { close } = getContext<{ close: () => void }>("dialog");
</script>

<div
	class={cn(
		"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 sm:rounded-none",
		className
	)}
	role="document"
>
	{@render children?.()}
	<button
		type="button"
		onclick={close}
		class="absolute right-4 top-4 rounded-none opacity-70 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none hover:bg-accent hover:text-muted-foreground"
		aria-label="Close"
	>
		<X class="h-4 w-4" />
	</button>
</div>
