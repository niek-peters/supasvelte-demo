// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	type Message = {
		id: number;
		message: string;
		created_at: string;
	};

	type NewMessage = Omit<Message, 'id' | 'created_at'>;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
