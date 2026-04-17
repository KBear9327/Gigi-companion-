import Dexie, { type Table } from 'dexie';

export interface ChatSession {
  id?: number;
  title: string;
  createdAt: number;
}

export interface Message {
  id?: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface Memory {
  id?: number;
  fact: string;
  category?: string;
  createdAt: number;
}

export class GigiDatabase extends Dexie {
  sessions!: Table<ChatSession>;
  messages!: Table<Message>;
  memories!: Table<Memory>;

  constructor() {
    super('GigiDatabase');
    this.version(1).stores({
      sessions: '++id, title, createdAt',
      messages: '++id, sessionId, role, createdAt',
      memories: '++id, fact, category, createdAt'
    });
  }
}

export const db = new GigiDatabase();
