import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type WatchEventKind = 'add' | 'change' | 'remove';

export interface WatchEvent {
  readonly kind: WatchEventKind;
  readonly path: string;
}

export interface ModuleWatcherOptions {
  /** Directories (scanned recursively) or individual files to observe. */
  readonly paths: readonly string[];
  /** File extensions treated as modules. Defaults to `.js`, `.cjs`, `.mjs`. */
  readonly extensions?: readonly string[];
  /** Entry filename suffix before the extension. Explicit file roots bypass this filter. */
  readonly entrySuffix?: string;
  /** Path fragments that are skipped entirely. Matched case-insensitively. */
  readonly ignore?: readonly string[];
  /** Quiet period in milliseconds before an event is emitted. Defaults to 150. */
  readonly debounce?: number;
}

const DEFAULT_EXTENSIONS: readonly string[] = ['.js', '.cjs', '.mjs'];
const DEFAULT_IGNORE: readonly string[] = ['node_modules', '.git', '.hivelet'];
const DEFAULT_DEBOUNCE = 150;

export interface ModuleWatcher {
  on(event: 'add' | 'change' | 'remove', listener: (modulePath: string) => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(event: 'all', listener: (payload: WatchEvent) => void): this;
  on(event: 'dependency', listener: (dependencyPath: string) => void): this;
}

/**
 * Recursive filesystem watcher built on `fs.watch`, with debouncing and add/remove
 * detection. Directories added at runtime are picked up automatically, so dropping a new
 * module file into a watched folder is enough to have the kernel load it.
 */
export class ModuleWatcher extends EventEmitter {
  private readonly roots: readonly string[];
  private readonly extensions: ReadonlySet<string>;
  private readonly ignore: readonly string[];
  private readonly debounce: number;
  private readonly entrySuffix: string;
  private readonly explicitFiles = new Set<string>();
  private readonly dependencies = new Set<string>();

  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly known = new Set<string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(options: ModuleWatcherOptions) {
    super();

    if (!Array.isArray(options.paths) || options.paths.length === 0) {
      throw new TypeError('paths must contain at least one directory or file');
    }

    this.roots = options.paths.map(entry => path.resolve(entry));
    this.extensions = new Set((options.extensions ?? DEFAULT_EXTENSIONS).map(value => value.toLowerCase()));
    this.ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])].map(value => value.toLowerCase());
    this.debounce = options.debounce ?? DEFAULT_DEBOUNCE;
    this.entrySuffix = options.entrySuffix ?? '.module';

    if (!Number.isInteger(this.debounce) || this.debounce < 0 || this.debounce > 60000) {
      throw new RangeError('debounce must be an integer between 0 and 60000');
    }
  }

  /** Replaces the exact local dependency paths observed for active entry modules. */
  setDependencies(dependencies: readonly string[]): void {
    this.dependencies.clear();
    for (const dependency of dependencies) {
      const resolved = path.resolve(dependency);
      this.dependencies.add(resolved);
      if (this.running) this.watchDirectory(path.dirname(resolved));
    }
  }

  /** Returns the module files discovered by the initial scan. */
  start(): readonly string[] {
    if (this.running) {
      return this.list();
    }

    this.running = true;
    for (const root of this.roots) {
      this.scan(root);
    }

    return this.list();
  }

  stop(): void {
    this.running = false;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.known.clear();
  }

  /** Module files currently known to the watcher, sorted for deterministic load order. */
  list(): readonly string[] {
    return [...this.known].sort();
  }

  private scan(target: string): void {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(target);
    } catch {
      return;
    }

    if (stats.isFile()) {
      if (this.roots.includes(target)) this.explicitFiles.add(target);
      if (this.isModuleFile(target)) {
        this.known.add(target);
        this.watchDirectory(path.dirname(target));
      }
      return;
    }

    if (!stats.isDirectory() || this.isIgnored(target)) {
      return;
    }

    this.watchDirectory(target);

    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (this.isIgnored(child)) {
        continue;
      }

      if (entry.isDirectory()) {
        this.scan(child);
      } else if (entry.isFile() && this.isModuleFile(child)) {
        this.known.add(child);
      }
    }
  }

  private watchDirectory(directory: string): void {
    if (this.watchers.has(directory) || this.isIgnored(directory)) {
      return;
    }

    try {
      const watcher = fs.watch(directory, (_event, filename) => {
        if (!filename) {
          return;
        }
        this.schedule(path.join(directory, filename.toString()));
      });

      watcher.on('error', error => this.emit('error', error));
      this.watchers.set(directory, watcher);
    } catch (error) {
      this.emit('error', error);
    }
  }

  private schedule(target: string): void {
    if (!this.running || this.isIgnored(target)) {
      return;
    }

    const existing = this.timers.get(target);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(target);
      this.settle(target);
    }, this.debounce);

    timer.unref?.();
    this.timers.set(target, timer);
  }

  private settle(target: string): void {
    if (!this.running) {
      return;
    }

    let stats: fs.Stats | undefined;
    try {
      stats = fs.statSync(target);
    } catch {
      stats = undefined;
    }

    if (stats?.isDirectory()) {
      // A directory appeared (or changed); pick up any modules inside it.
      const before = new Set(this.known);
      this.scan(target);
      for (const discovered of this.known) {
        if (!before.has(discovered)) {
          this.dispatch('add', discovered);
        }
      }
      return;
    }

    if (this.dependencies.has(target)) {
      this.emit('dependency', target);
      return;
    }

    if (!this.isModuleFile(target)) {
      return;
    }

    if (!stats) {
      if (this.known.delete(target)) {
        this.dispatch('remove', target);
      }
      return;
    }

    if (this.known.has(target)) {
      this.dispatch('change', target);
    } else {
      this.known.add(target);
      this.dispatch('add', target);
    }
  }

  private dispatch(kind: WatchEventKind, modulePath: string): void {
    this.emit(kind, modulePath);
    this.emit('all', { kind, path: modulePath });
  }

  private isModuleFile(target: string): boolean {
    const extension = path.extname(target).toLowerCase();
    const stem = path.basename(target, extension);
    return this.extensions.has(extension)
      && (this.explicitFiles.has(target) || stem.endsWith(this.entrySuffix))
      && !this.isIgnored(target);
  }

  private isIgnored(target: string): boolean {
    const normalized = target.toLowerCase().split(path.sep).join('/');
    return this.ignore.some(fragment => normalized.includes(`/${fragment}`) || normalized.endsWith(fragment));
  }
}
