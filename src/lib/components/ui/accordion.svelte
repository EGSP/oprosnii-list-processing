<script lang="ts">
	import { setContext } from "svelte";
	import { writable } from "svelte/store";
	import type { Snippet } from "svelte";

	interface $$Props {
		type?: "single" | "multiple";
		collapsible?: boolean;
		children?: Snippet;
		class?: string;
	}

	let {
		type = "single",
		collapsible = false,
		children,
		class: className = "",
	}: $$Props = $props();

	const openValues = writable<string[]>([]);

	function toggle(value: string) {
		openValues.update((prev) => {
			const isOpen = prev.includes(value);
			if (type === "single") {
				if (isOpen && collapsible) return [];
				if (isOpen) return prev;
				return [value];
			}
			if (isOpen) return prev.filter((v) => v !== value);
			return [...prev, value];
		});
	}

	setContext("accordion", { type, collapsible, openValues, toggle });
</script>

<div class={className}>
	{@render children?.()}
</div>
