<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

	interface $$Props {
		class?: string;
		variant?: BadgeVariant;
		children?: Snippet;
	}

	let {
		class: className = "",
		variant = "default",
		children
	}: $$Props = $props();
</script>

<div
	class={cn(
		"inline-flex items-center rounded-none border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
		{
			"border-transparent bg-primary text-primary-foreground": variant === "default",
			"border-transparent bg-secondary text-secondary-foreground": variant === "secondary",
			"border-transparent bg-destructive text-destructive-foreground": variant === "destructive",
			"text-foreground": variant === "outline"
		},
		className
	)}
>
	{@render children?.()}
</div>

