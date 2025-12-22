<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import type { TextareaHTMLAttributes } from "svelte/elements";

	interface $$Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<textarea
	class={cn(
		"flex min-h-[80px] w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
></textarea>

