<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import { Dialog } from "bits-ui";
	import type { Snippet } from "svelte";

	interface $$Props extends Dialog.TitleProps {
		class?: string;
		children?: Snippet;
	}

	let {
		class: className = "",
		children,
		...restProps
	}: $$Props = $props();
</script>

<Dialog.Title
	class={cn("text-lg font-semibold leading-none tracking-tight", className)}
	{...restProps}
>
	{@render children?.()}
</Dialog.Title>

