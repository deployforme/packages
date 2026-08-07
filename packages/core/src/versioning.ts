import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type RevisionStatus = 'active' | 'superseded' | 'failed' | 'rolled-back';

export interface ModuleRevision {
  /** Monotonic, 1-based revision counter scoped to a single module. */
  readonly revision: number;
  readonly moduleName: string;
  readonly modulePath: string;
  /** The `version` field declared by the module itself. */
  readonly version: string;
  /** SHA-256 of the module source at the time it was recorded. */
  readonly checksum: string;
  readonly recordedAt: string;
  /** Location of the stored source snapshot, relative to the store directory. */
  readonly snapshot: string;
  readonly status: RevisionStatus;
  /** Set when this revision was produced by rolling back to an earlier one. */
  readonly restoredFrom?: number;
  readonly error?: string;
}

export interface VersionStoreOptions {
  /** Root directory for snapshots and indexes. Defaults to `.hivelet/versions`. */
  readonly directory?: string;
  /** Number of revisions retained per module. Older snapshots are pruned. */
  readonly keep?: number;
}

interface ModuleIndex {
  moduleName: string;
  revisions: ModuleRevision[];
}

const DEFAULT_DIRECTORY = '.hivelet/versions';
const DEFAULT_KEEP = 20;
const INDEX_FILE = 'index.json';

/**
 * Append-only history of every module source that the kernel has successfully loaded.
 * Snapshots are written to disk so history — and therefore rollback — survives restarts.
 */
export class VersionStore {
  private readonly directory: string;
  private readonly keep: number;
  private readonly cache = new Map<string, ModuleIndex>();

  constructor(options: VersionStoreOptions = {}) {
    this.directory = path.resolve(options.directory ?? DEFAULT_DIRECTORY);
    this.keep = options.keep ?? DEFAULT_KEEP;

    if (!Number.isInteger(this.keep) || this.keep < 1 || this.keep > 1000) {
      throw new RangeError('keep must be an integer between 1 and 1000');
    }
  }

  /**
   * Records the current source of a module. When the checksum matches the newest
   * revision, no new revision is created and the existing one is returned — reloading an
   * unchanged file should not inflate the history.
   */
  record(input: {
    readonly moduleName: string;
    readonly modulePath: string;
    readonly version: string;
    readonly restoredFrom?: number;
  }): ModuleRevision {
    const source = fs.readFileSync(path.resolve(input.modulePath));
    const checksum = createHash('sha256').update(source).digest('hex');
    const index = this.load(input.moduleName);
    const latest = index.revisions.at(-1);

    if (latest && latest.checksum === checksum && input.restoredFrom === undefined) {
      return latest;
    }

    const revision = (latest?.revision ?? 0) + 1;
    const snapshot = `${String(revision).padStart(4, '0')}-${checksum.slice(0, 12)}${path.extname(input.modulePath)}`;
    const moduleDirectory = this.moduleDirectory(input.moduleName);

    fs.mkdirSync(moduleDirectory, { recursive: true });
    fs.writeFileSync(path.join(moduleDirectory, snapshot), source);

    const record: ModuleRevision = {
      revision,
      moduleName: input.moduleName,
      modulePath: path.resolve(input.modulePath),
      version: input.version,
      checksum,
      recordedAt: new Date().toISOString(),
      snapshot,
      status: 'active',
      restoredFrom: input.restoredFrom
    };

    index.revisions = index.revisions.map(entry =>
      entry.status === 'active' ? { ...entry, status: 'superseded' as const } : entry
    );
    index.revisions.push(record);
    this.prune(index);
    this.persist(index);

    return record;
  }

  /** Marks a failed load attempt so the history shows what was rejected and why. */
  recordFailure(moduleName: string, modulePath: string, error: string): void {
    const index = this.load(moduleName);
    const latest = index.revisions.at(-1);

    index.revisions.push({
      revision: (latest?.revision ?? 0) + 1,
      moduleName,
      modulePath: path.resolve(modulePath),
      version: 'unknown',
      checksum: '',
      recordedAt: new Date().toISOString(),
      snapshot: '',
      status: 'failed',
      error
    });

    this.prune(index);
    this.persist(index);
  }

  /** Full history, oldest first. */
  history(moduleName: string): readonly ModuleRevision[] {
    return [...this.load(moduleName).revisions];
  }

  /** The revision currently serving traffic, if any. */
  current(moduleName: string): ModuleRevision | undefined {
    return this.load(moduleName)
      .revisions.slice()
      .reverse()
      .find(entry => entry.status === 'active');
  }

  get(moduleName: string, revision: number): ModuleRevision | undefined {
    return this.load(moduleName).revisions.find(entry => entry.revision === revision);
  }

  /** The newest successfully loaded revision before the active one. */
  previous(moduleName: string): ModuleRevision | undefined {
    const usable = this.load(moduleName).revisions.filter(entry => entry.status !== 'failed');
    return usable.at(-2);
  }

  /** Reads a stored snapshot back. Throws when the snapshot has been pruned. */
  readSnapshot(revision: ModuleRevision): Buffer {
    if (!revision.snapshot) {
      throw new Error(`Revision ${revision.revision} of ${revision.moduleName} has no snapshot`);
    }

    const snapshotPath = path.join(this.moduleDirectory(revision.moduleName), revision.snapshot);
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot for ${revision.moduleName}@r${revision.revision} was pruned`);
    }

    return fs.readFileSync(snapshotPath);
  }

  /** Modules that have at least one recorded revision. */
  modules(): readonly string[] {
    if (!fs.existsSync(this.directory)) {
      return [];
    }

    return fs
      .readdirSync(this.directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => decodeURIComponent(entry.name))
      .sort();
  }

  private load(moduleName: string): ModuleIndex {
    const cached = this.cache.get(moduleName);
    if (cached) {
      return cached;
    }

    const indexPath = path.join(this.moduleDirectory(moduleName), INDEX_FILE);
    let index: ModuleIndex = { moduleName, revisions: [] };

    if (fs.existsSync(indexPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ModuleIndex;
        if (Array.isArray(parsed.revisions)) {
          index = { moduleName, revisions: parsed.revisions };
        }
      } catch {
        // A corrupt index must not stop the runtime; start a fresh history instead.
      }
    }

    this.cache.set(moduleName, index);
    return index;
  }

  private persist(index: ModuleIndex): void {
    const moduleDirectory = this.moduleDirectory(index.moduleName);
    fs.mkdirSync(moduleDirectory, { recursive: true });
    fs.writeFileSync(path.join(moduleDirectory, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
    this.cache.set(index.moduleName, index);
  }

  private prune(index: ModuleIndex): void {
    if (index.revisions.length <= this.keep) {
      return;
    }

    const removed = index.revisions.splice(0, index.revisions.length - this.keep);
    for (const revision of removed) {
      if (!revision.snapshot) {
        continue;
      }
      try {
        fs.rmSync(path.join(this.moduleDirectory(index.moduleName), revision.snapshot), { force: true });
      } catch {
        // Best effort cleanup only.
      }
    }
  }

  private moduleDirectory(moduleName: string): string {
    return path.join(this.directory, encodeURIComponent(moduleName));
  }
}
