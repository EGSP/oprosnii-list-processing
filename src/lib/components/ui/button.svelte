<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import type { ButtonHTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
	type ButtonSize = "default" | "sm" | "lg" | "icon";

	interface $$Props extends ButtonHTMLAttributes<HTMLButtonElement> {
		variant?: ButtonVariant;
		size?: ButtonSize;
		asChild?: boolean;
		children?: Snippet;
		// Explicitly include common HTML button attributes for TypeScript
		disabled?: boolean;
		onclick?: ((event: MouseEvent) => void) | null | undefined;
		title?: string;
		"aria-label"?: string;
	}

	let {
		class: className = "",
		variant = "default",
		size = "default",
		asChild = false,
		children,
		...restProps
	}: $$Props = $props();
</script>

<button
	class={cn(
		"inline-flex items-center justify-center whitespace-nowrap rounded-none text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
		{
			"bg-primary text-primary-foreground": variant === "default",
			"bg-destructive text-destructive-foreground": variant === "destructive",
			"border border-input bg-background": variant === "outline",
			"bg-secondary text-secondary-foreground": variant === "secondary",
			"": variant === "ghost",
			"text-primary": variant === "link",
			"h-10 px-4 py-2": size === "default",
			"h-9 px-3": size === "sm",
			"h-11 px-8": size === "lg",
			"h-10 w-10": size === "icon"
		},
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>

