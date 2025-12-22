<script lang="ts">
	import { cn } from "$lib/utils/cn";

	type AlertVariant = "default" | "destructive";

	interface $$Props {
		class?: string;
		variant?: AlertVariant;
	}

	let {
		class: className = "",
		variant = "default"
	}: $$Props = $props();
</script>

<div
	role="alert"
	class={cn(
		"relative w-full rounded-lg border p-4",
		{
			"bg-background text-foreground": variant === "default",
			"border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive": variant === "destructive"
		},
		className
	)}
>
	<slot />
</div>

