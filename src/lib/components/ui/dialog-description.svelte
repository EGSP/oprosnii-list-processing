<script lang="ts">
	import { cn } from "$lib/utils/cn";
	import * as DialogPrimitive from "bits-ui";

	interface $$Props extends DialogPrimitive.DescriptionProps {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<DialogPrimitive.Description
	class={cn("text-sm text-muted-foreground", className)}
	{...restProps}
>
	<slot />
</DialogPrimitive.Description>

