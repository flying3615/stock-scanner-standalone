import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newsLogger } from './utils.js';

export interface KvStore {
  get(key: string, type?: 'text' | 'json' | { type: 'text' | 'json' }): Promise<unknown | null>;
  put(key: string, value: string | ArrayBuffer, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

type StoreShape = Record<string, string>;

export class JsonFileKvStore implements KvStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async get(key: string, type: 'text' | 'json' | { type: 'text' | 'json' } = 'text'): Promise<unknown | null> {
    const store = await this.readStore();
    const value = store[key];
    if (typeof value !== 'string') {
      return null;
    }

    const targetType = typeof type === 'string' ? type : type.type;
    if (targetType === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    return value;
  }

  async put(key: string, value: string | ArrayBuffer, _options?: unknown): Promise<void> {
    const serialized = typeof value === 'string' ? value : Buffer.from(value).toString('utf8');
    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      store[key] = serialized;
      await this.writeStore(store);
    });
  }

  async delete(key: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const store = await this.readStore();
      delete store[key];
      await this.writeStore(store);
    });
  }

  private async enqueueWrite(work: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(work, work);
    await this.writeQueue;
  }

  private async readStore(): Promise<StoreShape> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const result: StoreShape = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
      return result;
    } catch (error) {
      if (isErrnoWithCode(error, 'ENOENT')) {
        return {};
      }
      const message = error instanceof Error ? error.message : String(error);

      newsLogger.warn('[FinancialJuice] Failed to read token store, starting fresh', {
        filePath: this.filePath,
        error: message
      });
      return {};
    }
  }

  private async writeStore(store: StoreShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }
}

function isErrnoWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return !!error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
