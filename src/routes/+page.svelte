<script lang="ts">
	import '../app.css';
	import { fade } from 'svelte/transition';
	import { supabase } from '../hooks';
	import { getStore } from '$lib/stores/supabaseStore';
	import type { Session } from '@supabase/supabase-js';
	import { onMount } from 'svelte';

	let session: Session | null = null;

	// #region Messages
	const messages = getStore<Message, NewMessage, MutateMessage>(supabase, 'messages');

	let message = '';
	async function addMessage() {
		session = (await supabase.auth.getSession()).data.session;

		if (!session) {
			alert('You must be logged in to send messages');
			return;
		}

		await messages.add({
			message: message,
			user_id: session.user.id
		});

		message = '';
	}

	let editedMessage: Message;
	async function updateMessage() {
		await messages.mutate(editedMessage.id, {
			message: editedMessage.message
		});

		editing = null;
	}

	let editing: number | null;
	// #endregion

	// #region Auth
	onMount(async () => {
		session = (await supabase.auth.getSession()).data.session;
	});

	let overlay: 'login' | 'signup' | null = null;

	let email = '';
	let password = '';
	let confirmPassword = '';

	async function signUp() {
		const { error } = await supabase.auth.signUp({
			email,
			password
		});

		if (error) {
			alert(error.message);
			return error.message;
		}

		alert('Check your email for the confirmation link!');
	}

	async function logIn() {
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			alert(error.message);
			return error.message;
		}

		session = (await supabase.auth.getSession()).data.session;
	}
	// #endregion
</script>

<div
	on:mousedown={() => (overlay = null)}
	class="relative h-screen w-screen flex items-center justify-center"
>
	<div
		class="relative flex flex-col gap-8 bg-zinc-700 min-h-screen w-screen transition {overlay
			? 'brightness-75'
			: ''}"
	>
		<header class="flex justify-between mx-8 py-4 border-b border-zinc-600">
			<h1 class="flex gap-1 text-4xl text-white font-bold">
				<span class="text-[#3ecf8e]">Supa</span><span class="text-[#ff3e00]">Svelte</span>
			</h1>
			<section class="flex gap-2">
				{#if session}
					<button
						on:click={async () => {
							await supabase.auth.signOut();
							session = null;
						}}
						class="flex items-center justify-center px-4 rounded-md bg-zinc-600/60 hover:bg-zinc-600/40 transition text-zinc-100 font-bold"
						>Log out</button
					>
				{:else}
					<button
						on:click={() => (overlay = 'login')}
						class="flex items-center justify-center px-4 rounded-md bg-zinc-600/60 hover:bg-zinc-600/40 transition text-zinc-300 font-bold"
						>Login</button
					>
				{/if}
				<button
					on:click={() => (overlay = 'signup')}
					class="flex items-center justify-center px-4 rounded-md bg-[#3ecf8e] hover:bg-[#3ecf8e]/80 transition text-zinc-100 font-bold"
					>Sign up</button
				>
			</section>
		</header>
		<main class="flex flex-col gap-8 px-8 h-full w-screen">
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
					<div
						class="flex justify-between bg-zinc-500/20 rounded-md px-2 py-1 w-fit gap-4 text-white"
					>
						{#if editing === message.id && message.user_id === session?.user.id}
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
						{#if message.user_id === session?.user.id}
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
						{/if}
					</div>
				{/each}
			</section>
		</main>
	</div>
	{#if overlay}
		<div
			transition:fade={{ duration: 150 }}
			on:mousedown|stopPropagation
			class="absolute w-2/5 flex flex-col gap-8 p-12 bg-zinc-600 rounded-md z-10 shadow-2xl"
		>
			<h1 class="text-center text-zinc-200 text-4xl font-bold">
				{overlay === 'login' ? 'Login' : 'Sign up'}
			</h1>
			<form
				on:submit|preventDefault={async () => {
					let error;

					if (overlay === 'login') error = await logIn();
					else if (password === confirmPassword) error = await signUp();
					else alert('Passwords do not match');

					if (error) return;

					email = '';
					password = '';
					confirmPassword = '';
					overlay = null;
				}}
				class="flex flex-col gap-4"
			>
				<div class="flex flex-col gap-2">
					<label for="email" class="text-white font-bold text-lg">Email:</label>
					<input
						bind:value={email}
						type="email"
						id="email"
						placeholder="someone@email.com"
						required
						class="bg-zinc-500/50 focus:bg-zinc-500/70 transition px-4 py-2 rounded-md text-white outline-none"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label for="password" class="text-white font-bold text-lg">Password:</label>
					<input
						bind:value={password}
						type="password"
						id="password"
						minlength="8"
						maxlength="63"
						placeholder="**********"
						required
						class="bg-zinc-500/50 focus:bg-zinc-500/70 transition px-4 py-2 rounded-md text-white outline-none"
					/>
				</div>
				{#if overlay === 'signup'}
					<div class="flex flex-col gap-2">
						<label for="confirmPassword" class="text-white font-bold text-lg"
							>Confirm password:</label
						>
						<input
							bind:value={confirmPassword}
							type="password"
							id="confirmPassword"
							minlength="8"
							maxlength="63"
							placeholder="**********"
							required
							class="bg-zinc-500/50 focus:bg-zinc-500/70 transition px-4 py-2 rounded-md text-white outline-none"
						/>
					</div>
				{/if}
				<button
					type="submit"
					class="mt-4 bg-[#3ecf8e] hover:bg-[#3ecf8e]/80 transition px-4 py-2 rounded-md text-white font-bold"
					>{overlay === 'login' ? 'Login' : 'Sign up'}</button
				>
			</form>
		</div>
	{/if}
</div>

<style>
	.min-h-screen {
		min-height: 100vh;
	}
</style>
