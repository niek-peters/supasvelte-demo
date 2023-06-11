// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	type Message = {
		id: number;
		message: string;
		created_at: string;
		user_id: string;
	};

	type NewMessage = Omit<Message, 'id' | 'created_at'>;

	type MutateMessage = Omit<NewMessage, 'user_id'>;

	type BroadcastMessage = {
		uuid: string;
		message: string;
	};

	type NewBroadcastMessage = Omit<BroadcastMessage, 'uuid'>;

	type MutateBroadcastMessage = Omit<BroadcastMessage, 'uuid'>;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
