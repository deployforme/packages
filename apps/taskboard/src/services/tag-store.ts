export interface Tag {
  id: string;
  name: string;
  color: string;
}

export class TagStore {
  private readonly tags = new Map<string, Tag>();
  private counter = 0;

  list(): Tag[] {
    return Array.from(this.tags.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): Tag | undefined {
    return this.tags.get(id);
  }

  has(id: string): boolean {
    return this.tags.has(id);
  }

  create(name: string, color: string = 'gray'): Tag {
    this.counter += 1;
    const tag: Tag = { id: `tag_${this.counter}`, name, color };
    this.tags.set(tag.id, tag);
    return tag;
  }

  seedIfEmpty(): void {
    if (this.tags.size > 0) return;
    this.create('urgent', 'red');
    this.create('chore', 'gray');
    this.create('feature', 'blue');
  }
}
