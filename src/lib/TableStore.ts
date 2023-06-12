/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	PostgrestError,
	RealtimeChannel,
	RealtimeChannelSendResponse,
	SupabaseClient
} from '@supabase/supabase-js';
import { get, writable, type Subscriber, type Writable, type Unsubscriber } from 'svelte/store';

export interface TableRow {
	[x: string]: any;
}

/**
 * Get a store that contains realtime data from a table in your Supabase PostgreSQL database. This store can also be used to add, remove and mutate data in the table.
 *
 * It is possible to provide 3 generic types to this function:
 * - `Entry`: The type of the data that is stored in the table, including all columns from the table as fields
 * - `NewEntry`: The type of the data that can be added to the table (for example, without the `id` and nullable fields)
 * - `MutateEntry`: The type of the data that can be mutated in the table (for example, without the `id` and other fields that shouldn't be changed)
 *
 * The last two generics are optional, and will default to the `Entry` type, but without the `id` field.
 *
 * @param supabase An instance of the Supabase Client
 * @param tableName The name of the table you want to read/write data from/to
 * @param options An object with options for the store
 * @param options.indexName The name of the table's primary key or index (default: `id`. If you change this, you should probably provide your own NewEntry and MutateEntry types)
 * @param options.mutateInterval The interval in milliseconds between table mutations. When set to a value, calls to the mutate() function will send the update to all connected clients, but won't update the database. Will update the database after a certain time or when disconnecting automatically. Can be used to reduce database operations (default: `undefined`. Do not use negative numbers)
 * @param onReady A callback that will be called when channel for broadcasting mutations is ready to be used
 * @returns A store that contains realtime data from the table
 */
export function getTableStore<
	Entry extends TableRow,
	NewEntry extends TableRow = Omit<Entry, 'id'>,
	MutateEntry extends TableRow = NewEntry
>(
	supabase: SupabaseClient,
	tableName: string,
	options?: {
		indexName?: string;
		mutateInterval?: number;
	},
	onReady?: () => void
): TableStore<Entry, NewEntry, MutateEntry> {
	if (!options) options = {};
	if (!options.indexName) options.indexName = 'id';
	if (!options.mutateInterval) options.mutateInterval = 0;

	if (options.mutateInterval < 0) throw new Error('TableStore.mutateInterval cannot be negative');

	// @ts-ignore
	return new TableStore<Entry, NewEntry, MutateEntry>(supabase, tableName, options, onReady);
}

class TableStore<Entry extends TableRow, NewEntry extends TableRow, MutateEntry extends TableRow> {
	private readonly _supabase: SupabaseClient;
	private readonly _store: Writable<Entry[]>;
	private readonly _postgresChannel: RealtimeChannel;
	private readonly _broadcastChannel: RealtimeChannel;
	private readonly _onReady?: () => void;
	private _lastMutate: number = Date.now();
	private _unsavedIds: (string | number)[] = [];
	private _unsubscribingPostgres: Promise<void> | undefined;
	private _unsubscribingBroadcast: Promise<void> | undefined;

	public subscribe: (
		this: void,
		run: Subscriber<Entry[]>,
		invalidate?: (value?: Entry[]) => void | undefined
	) => Unsubscriber;

	public readonly tableName: string;
	public readonly indexName: string;
	public readonly mutateInterval: number;

	constructor(
		supabase: SupabaseClient,
		tableName: string,
		options: {
			indexName: string;
			mutateInterval: number;
		},
		onReady?: () => void
	) {
		this._supabase = supabase;
		this.tableName = tableName;
		this.indexName = options.indexName;
		this.mutateInterval = options.mutateInterval;
		this._onReady = onReady;

		this._store = writable<Entry[]>([], this._subscriptionHandler);
		supabase
			.from(tableName)
			.select('*')
			.then((data) => this._store.set(data.data || []));

		this.subscribe = this._store.subscribe;

		this._postgresChannel = this._getRealtimePostgresChannel();
		this._broadcastChannel = this._getRealtimeBroadcastChannel();
	}

	public async add(entry: NewEntry): Promise<PostgrestError | null> {
		return (await this._supabase.from(this.tableName).insert(entry)).error;
	}

	public async remove(id: string | number): Promise<PostgrestError | null> {
		return (await this._supabase.from(this.tableName).delete().eq(this.indexName, id)).error;
	}

	public async mutate(id: string | number, entry: MutateEntry): Promise<PostgrestError | null> {
		// If the mutateInterval is set, and the last mutate was less than the mutateInterval ago,
		// we don't want to mutate the table again, but instead broadcast the change to all clients
		if (this._broadcastChannel.state === 'joined' && this.mutateInterval) {
			const now = Date.now();
			if (this._lastMutate && now - this._lastMutate < this.mutateInterval) {
				let res: RealtimeChannelSendResponse | null = null;
				let attempts = 0;

				while (res !== 'ok' && attempts < 10) {
					res = await this._broadcastChannel.send({
						type: 'broadcast',
						event: `${this.tableName}-mutate`,
						entry: {
							[this.indexName]: id,
							...entry
						}
					});
					await new Promise((resolve) => setTimeout(resolve, 100));

					attempts++;
				}

				this._unsavedIds = [...this._unsavedIds, id];
				return null;
			} else {
				this._lastMutate = now;
			}
		}

		const savedIds = await this._saveUnsavedEntries();
		if (savedIds.includes(id)) return null;
		return (await this._supabase.from(this.tableName).update(entry).eq(this.indexName, id)).error;
	}

	private _getRealtimePostgresChannel(
		supabase: SupabaseClient<any, 'public', any> = this._supabase,
		store: Writable<Entry[]> = this._store,
		tableName: string = this.tableName,
		indexName = this.indexName
	) {
		return supabase.channel(`${tableName}-table-changes`).on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: tableName
			},
			(payload) => {
				if (!(indexName in payload.new) && !(indexName in payload.old))
					console.error(`Index ${indexName} not found in payload`);

				switch (payload.eventType) {
					case 'INSERT':
						store.update((data: Entry[]) => [...data, payload.new as Entry]);
						break;
					case 'UPDATE':
						store.update((data: Entry[]) =>
							data.map((item: Entry) =>
								item[indexName] === payload.new[indexName] ? (payload.new as Entry) : item
							)
						);
						break;
					case 'DELETE':
						store.update((data: Entry[]) =>
							data.filter((item: Entry) => item[indexName] !== payload.old[indexName])
						);
						break;
				}
			}
		);
	}

	private _getRealtimeBroadcastChannel(
		supabase: SupabaseClient<any, 'public', any> = this._supabase,
		store: Writable<Entry[]> = this._store,
		tableName: string = this.tableName,
		indexName = this.indexName
	) {
		return supabase
			.channel(`${tableName}-broadcast-changes`, {
				config: {
					broadcast: {
						self: true
					}
				}
			})
			.on(
				'broadcast',
				{
					event: `${tableName}-mutate`
				},
				(payload) => {
					store.update((data: Entry[]) =>
						data.map((item: Entry) =>
							item[indexName] === payload[indexName] ? (payload.entry as Entry) : item
						)
					);
				}
			);
	}

	private _subscriptionHandler = () => {
		if (this._postgresChannel.state !== 'joined' && this._postgresChannel.state !== 'joining') {
			if (this._unsubscribingPostgres)
				this._unsubscribingPostgres.then(() => {
					console.log('subscribed to postgres channel');
					this._postgresChannel.subscribe();
				});
			else {
				console.log('subscribed to postgres channel');
				this._postgresChannel.subscribe();
			}
		}

		if (this._broadcastChannel.state !== 'joined' && this._broadcastChannel.state !== 'joining') {
			if (this._unsubscribingBroadcast)
				this._unsubscribingBroadcast.then(() => {
					console.log('subscribed to broadcast channel');
					this._broadcastChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED' && this._onReady) this._onReady();
					});
				});
			else {
				console.log('subscribed to broadcast channel');
				this._broadcastChannel.subscribe((status) => {
					if (status === 'SUBSCRIBED' && this._onReady) this._onReady();
				});
			}
		}

		if (typeof window !== 'undefined') {
			window.addEventListener(
				'beforeunload',
				() => {
					this._closeConnections();
				},
				{
					once: true
				}
			);
		}

		return () => {
			this._closeConnections();
		};
	};

	private _closeConnections = async () => {
		if (this._postgresChannel.state === 'joined') {
			this._unsubscribingPostgres = new Promise((res, rej) => {
				this._postgresChannel.unsubscribe().then((value) => {
					if (value === 'ok') {
						console.log('unsubscribed from postgres channel');
						res();

						return;
					}
					rej();
				});
			});
		}

		if (this._broadcastChannel && this._broadcastChannel.state === 'joined') {
			this._unsubscribingBroadcast = new Promise((res, rej) => {
				this._saveUnsavedEntries().then(() => {
					if (this._broadcastChannel) {
						this._broadcastChannel.unsubscribe().then((value) => {
							if (value === 'ok') {
								console.log('unsubscribed from broadcast channel');
								res();

								return;
							}
							rej();
						});
					}
				});
			});
		}

		return;
	};

	private async _saveUnsavedEntries(
		supabase: SupabaseClient<any, 'public', any> = this._supabase,
		tableName: string = this.tableName,
		indexName: string = this.indexName
	): Promise<(string | number)[]> {
		let savedIds: (string | number)[] = [];

		if (this._unsavedIds && this._unsavedIds.length) {
			this._unsavedIds = [...new Set(this._unsavedIds)];

			for (const unsavedId of this._unsavedIds) {
				const unsavedEntry = structuredClone(
					get(this._store).find((entry) => entry[indexName] === unsavedId)
				);
				if (!unsavedEntry) continue;

				delete unsavedEntry[indexName];
				const { error } = await supabase
					.from(tableName)
					.update(unsavedEntry)
					.eq(indexName, unsavedId);

				if (!error) savedIds = [...savedIds, unsavedId];
			}

			this._unsavedIds = this._unsavedIds.filter((id) => !savedIds.includes(id));
		}

		return savedIds;
	}
}
