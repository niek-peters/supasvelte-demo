/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	RealtimeChannel,
	RealtimeChannelSendResponse,
	SupabaseClient
} from '@supabase/supabase-js';
import { writable, type Readable, type Writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export interface BroadcastEntry {
	uuid: string;
	[x: string]: any;
}

enum BroadcastEventType {
	Add = 'add',
	Remove = 'remove',
	Mutate = 'mutate'
}

export interface BroadcastStore<
	Entries extends BroadcastEntry[],
	NewEntry extends Omit<BroadcastEntry, 'uuid'>,
	MutateEntry extends Omit<BroadcastEntry, 'uuid'>
> extends Readable<Entries> {
	add(this: void, value: NewEntry): Promise<string | undefined>;
	remove(this: void, uuid: string): Promise<void>;
	mutate(this: void, uuid: string, value: MutateEntry): Promise<void>;
	onJoin(this: void, callback: () => void): void;
	channelName: string;
	channel: RealtimeChannel;
}

export function getBroadcastStore<
	Entry extends BroadcastEntry,
	NewEntry extends Omit<Entry, 'uuid'> = Omit<Entry, 'uuid'>,
	MutateEntry extends Omit<Entry, 'uuid'> = NewEntry
>(
	supabase: SupabaseClient<any, 'public', any>,
	channelName: string,
	initialData: Entry[] = [],
	onJoin?: () => void
): BroadcastStore<Entry[], NewEntry, MutateEntry> {
	const store: Writable<Entry[]> = writable([], () => {
		const broadcastStore = store as unknown as BroadcastStore<Entry[], NewEntry, MutateEntry>;

		if (broadcastStore.channel.state !== 'joined' && broadcastStore.channel.state !== 'joining')
			broadcastStore.channel.subscribe((status) => {
				if (status === 'SUBSCRIBED' && onJoin) onJoin();
			});

		return () => {
			broadcastStore.channel.unsubscribe();
		};
	});

	store.set(initialData);

	const realtimeStore = store as unknown as BroadcastStore<Entry[], NewEntry, MutateEntry>;

	const add = async (value: NewEntry): Promise<string | undefined> => {
		if (realtimeStore.channel.state !== 'joined') return;

		let res: RealtimeChannelSendResponse | null = null;
		let attempts = 0;

		const uuid = uuidv4();

		while (res !== 'ok' && attempts < 10) {
			res = await realtimeStore.channel.send({
				type: 'broadcast',
				event: `${channelName}-broadcast`,
				payload: { uuid, ...value },
				broadcastEventType: BroadcastEventType.Add
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			attempts++;
		}

		return uuid;
	};
	const remove = async (uuid: string) => {
		if (realtimeStore.channel.state !== 'joined') return;

		let res: RealtimeChannelSendResponse | null = null;
		let attempts = 0;

		while (res !== 'ok' && attempts < 10) {
			res = await realtimeStore.channel.send({
				type: 'broadcast',
				event: `${channelName}-broadcast`,
				payload: { uuid },
				broadcastEventType: BroadcastEventType.Remove
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			attempts++;
		}
	};
	const mutate = async (uuid: string, value: MutateEntry) => {
		if (realtimeStore.channel.state !== 'joined') return;

		let res: RealtimeChannelSendResponse | null = null;
		let attempts = 0;

		while (res !== 'ok' && attempts < 10) {
			res = await realtimeStore.channel.send({
				type: 'broadcast',
				event: `${channelName}-broadcast`,
				payload: { uuid, ...value },
				broadcastEventType: BroadcastEventType.Mutate
			});
			await new Promise((resolve) => setTimeout(resolve, 100));

			attempts++;
		}
	};
	const channel = getRealtimeBroadcastChannel<Entry>(supabase, store, channelName);

	realtimeStore.add = add;
	realtimeStore.remove = remove;
	realtimeStore.mutate = mutate;
	realtimeStore.channelName = channelName;
	realtimeStore.channel = channel;

	return realtimeStore;
}

function getRealtimeBroadcastChannel<Entry extends BroadcastEntry>(
	supabase: SupabaseClient<any, 'public', any>,
	store: Writable<Entry[]>,
	channelName: string
) {
	return supabase
		.channel(`${channelName}-broadcast-changes`, {
			config: {
				broadcast: {
					self: true
				}
			}
		})
		.on(
			'broadcast',
			{
				event: `${channelName}-broadcast`
			},
			(payload) => {
				console.log('payload', payload);

				if (!payload.broadcastEventType) return;

				switch (payload.broadcastEventType as BroadcastEventType) {
					case BroadcastEventType.Add:
						store.update((entries) => [...entries, payload.payload]);
						break;

					case BroadcastEventType.Remove:
						store.update((entries) =>
							entries.filter((entry) => entry.uuid !== payload.payload.uuid)
						);
						break;

					case BroadcastEventType.Mutate:
						store.update((entries) => {
							const index = entries.findIndex((entry) => entry.uuid === payload.payload.uuid);

							if (index === -1) return entries;

							entries[index] = { ...entries[index], ...payload.payload };

							return entries;
						});
				}
			}
		);
}
