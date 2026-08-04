export interface Comment {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
}

export class CommentStore {
  private readonly comments = new Map<string, Comment>();
  private counter = 0;

  listForTask(taskId: string): Comment[] {
    return Array.from(this.comments.values())
      .filter(c => c.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  add(taskId: string, author: string, body: string): Comment {
    this.counter += 1;
    const comment: Comment = {
      id: `c_${this.counter}`,
      taskId,
      author,
      body,
      createdAt: new Date().toISOString()
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  delete(id: string): boolean {
    return this.comments.delete(id);
  }

  clear(): void {
    this.comments.clear();
  }
}
