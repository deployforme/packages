import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import * as path from 'node:path';

interface StoredCredential {
  algorithm: 'sha512';
  salt: string;
  hash: string;
}

export class DashboardAuth {
  private credential?: StoredCredential;
  private readonly sessions = new Map<string, number>();

  constructor(
    private readonly file: string,
    private readonly sessionTtl: number
  ) {}

  async initialize(onGenerated: (password: string) => void): Promise<void> {
    try {
      this.credential = await this.readCredential();
      return;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    const password = randomBytes(24).toString('base64url');
    const credential: StoredCredential = {
      algorithm: 'sha512',
      salt: randomBytes(32).toString('hex'),
      hash: ''
    };
    credential.hash = digest(credential.salt, password);
    await mkdir(path.dirname(path.resolve(this.file)), { recursive: true });

    try {
      const handle = await open(this.file, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(credential, null, 2)}\n`, 'utf8');
      } finally {
        await handle.close();
      }
      this.credential = credential;
      onGenerated(password);
    } catch (error) {
      if (!isExistingFile(error)) throw error;
      this.credential = await this.readCredential();
    }
  }

  verifyPassword(password: string): boolean {
    if (!this.credential || typeof password !== 'string') return false;
    const actual = Buffer.from(digest(this.credential.salt, password), 'hex');
    const expected = Buffer.from(this.credential.hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  createSession(): string {
    this.removeExpiredSessions();
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(digest('', token), Date.now() + this.sessionTtl);
    return token;
  }

  hasSession(token: string | undefined): boolean {
    if (!token) return false;
    const key = digest('', token);
    const expiresAt = this.sessions.get(key);
    if (!expiresAt || expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }

  revokeSession(token: string | undefined): void {
    if (token) this.sessions.delete(digest('', token));
  }

  private async readCredential(): Promise<StoredCredential> {
    const value = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredCredential>;
    if (value.algorithm !== 'sha512' || typeof value.salt !== 'string' || typeof value.hash !== 'string') {
      throw new Error(`Invalid Hivelet dashboard credential file: ${this.file}`);
    }
    return value as StoredCredential;
  }

  private removeExpiredSessions(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.sessions) {
      if (expiresAt <= now) this.sessions.delete(token);
    }
  }
}

function digest(salt: string, value: string): string {
  return createHash('sha512').update(salt, 'utf8').update('\0').update(value, 'utf8').digest('hex');
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function isExistingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EEXIST';
}
