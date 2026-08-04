export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type TaskEvent =
  | { type: 'task:created'; task: Task }
  | { type: 'task:updated'; task: Task }
  | { type: 'task:deleted'; taskId: string }
  | { type: 'task:completed'; task: Task };

type Listener = (event: TaskEvent) => void;

export class TaskStore {
  private readonly tasks = new Map<string, Task>();
  private readonly listeners = new Set<Listener>();
  private counter = 0;

  list(filter?: { status?: TaskStatus; tagId?: string }): Task[] {
    const all = Array.from(this.tasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return all.filter(task => {
      if (filter?.status && task.status !== filter.status) return false;
      if (filter?.tagId && !task.tagIds.includes(filter.tagId)) return false;
      return true;
    });
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  create(input: { title: string; tagIds?: string[] }): Task {
    this.counter += 1;
    const now = new Date().toISOString();
    const task: Task = {
      id: `t_${this.counter}`,
      title: input.title,
      status: 'todo',
      tagIds: input.tagIds ?? [],
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(task.id, task);
    this.emit({ type: 'task:created', task });
    return task;
  }

  update(id: string, patch: { title?: string; status?: TaskStatus; tagIds?: string[] }): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;

    const next: Task = {
      ...existing,
      title: patch.title ?? existing.title,
      status: patch.status ?? existing.status,
      tagIds: patch.tagIds ?? existing.tagIds,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, next);
    this.emit({ type: 'task:updated', task: next });

    if (existing.status !== 'done' && next.status === 'done') {
      this.emit({ type: 'task:completed', task: next });
    }

    return next;
  }

  delete(id: string): boolean {
    const existed = this.tasks.delete(id);
    if (existed) {
      this.emit({ type: 'task:deleted', taskId: id });
    }
    return existed;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors must not poison the emitter
      }
    }
  }
}
