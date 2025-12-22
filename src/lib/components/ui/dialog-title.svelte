<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import * as DialogPrimitive from "bits-ui";

	interface $$Props extends DialogPrimitive.TitleProps {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<DialogPrimitive.Title
	class={cn("text-lg font-semibold leading-none tracking-tight", className)}
	{...restProps}
>
	<slot />
</DialogPrimitive.Title>

