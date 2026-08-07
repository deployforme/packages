import { Injectable } from '@nestjs/common';

export interface Todo {
  readonly id: string;
  title: string;
  completed: boolean;
  readonly createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  readonly title?: unknown;
}

@Injectable()
export class TodoStore {
  private readonly todos = new Map<string, Todo>();
  private sequence = 1;

  list(): Todo[] {
    return [...this.todos.values()];
  }

  get(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(input: CreateTodoInput): Todo {
    const title = this.normalizeTitle(input.title);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: String(this.sequence++),
      title,
      completed: false,
      createdAt: now,
      updatedAt: now
    };
    this.todos.set(todo.id, todo);
    return todo;
  }

  update(id: string, input: CreateTodoInput & { readonly completed?: unknown }): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) return undefined;

    if (input.title !== undefined) {
      todo.title = this.normalizeTitle(input.title);
    }
    if (input.completed !== undefined) {
      if (typeof input.completed !== 'boolean') {
        throw new TypeError('completed must be a boolean');
      }
      todo.completed = input.completed;
    }
    todo.updatedAt = new Date().toISOString();
    return todo;
  }

  remove(id: string): boolean {
    return this.todos.delete(id);
  }

  private normalizeTitle(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TypeError('title must be a non-empty string');
    }
    return value.trim();
  }
}
