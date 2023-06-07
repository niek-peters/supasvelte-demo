<script lang="ts">
	import '../app.css';
	import { supabase } from '../hooks';
	import { getStore } from '$lib/stores/supabaseStore';

	const messages = getStore<Message, NewMessage>(supabase, 'messages');

	let message = '';
	async function addMessage() {
		await messages.add({
			message: message
		});

		message = '';
	}

	let editedMessage: Message;
	async function updateMessage() {
		console.log(editedMessage);
		await messages.mutate(editedMessage.id, {
			message: editedMessage.message
		});

		editing = null;
	}

	let editing: number | null;
</script>

<main class="flex flex-col gap-8 p-8 bg-zinc-700 min-h-screen w-screen">
	<form class="flex gap-4 p-4 rounded-md bg-zinc-600" on:submit|preventDefault={addMessage}>
		<input
			class="px-2 py-1 bg-zinc-500 focus:bg-zinc-500/80 transition rounded-md outline-none text-white"
			type="text"
			name="message"
			required
			bind:value={message}
		/>
		<button
			class="px-2 py-1 bg-violet-700 hover:bg-violet-700/90 transition text-white rounded-md"
			type="submit">Send</button
		>
	</form>

	<section class="flex flex-col gap-4 bg-zinc-600 rounded-md p-4">
		{#each $messages as message}
			<div class="flex justify-between bg-zinc-500/20 rounded-md px-2 py-1 w-fit gap-4 text-white">
				{#if editing === message.id}
					<form class="flex gap-2" on:submit|preventDefault={updateMessage}>
						<input
							class="bg-zinc-500/40 px-2 rounded-md outline-none"
							type="text"
							bind:value={editedMessage.message}
						/>
						<button class="text-sky-600 hover:text-sky-600/80" type="submit">Confirm</button>
					</form>
				{:else}
					<p>{message.message}</p>
				{/if}
				<button
					class="text-violet-500 hover:text-violet-500/80 transition"
					on:click={() => {
						if (editing) editing = null;
						else {
							editing = message.id;
							editedMessage = message;
						}
					}}>Edit</button
				>
				<button
					class="text-rose-700 hover:text-rose-700/80 transition"
					on:click={() => {
						messages.remove(message.id);
					}}>Delete</button
				>
			</div>
		{/each}
	</section>
</main>

<style>
	.min-h-screen {
		min-height: 100vh;
	}
</style>
