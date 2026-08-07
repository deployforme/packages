import {
  Body,
  Controller,
  Delete,
  Get,
  OnError,
  Param,
  Patch,
  Post,
  Status,
  defineModule,
  notFound
} from '@hivelet/core';
import { TodoStore, type CreateTodoInput } from '../todo.store';

@Controller('/todos')
class TodosController {
  constructor(private readonly store: TodoStore) {}

  @Get()
  list() {
    const items = this.store.list();
    return { items, count: items.length };
  }

  @Get('/:id')
  get(@Param('id') id: string) {
    return this.store.get(id) ?? notFound('Todo not found');
  }

  @Post()
  @OnError(400)
  create(@Body() input: CreateTodoInput) {
    return this.store.create(input);
  }

  @Patch('/:id')
  @OnError(400)
  update(@Param('id') id: string, @Body() input: CreateTodoInput & { completed?: unknown }) {
    return this.store.update(id, input) ?? notFound('Todo not found');
  }

  @Delete('/:id')
  @Status(204)
  remove(@Param('id') id: string) {
    if (!this.store.remove(id)) notFound('Todo not found');
  }
}

export default defineModule({
  name: 'todos',
  version: '2.0.0',
  controllers: context => new TodosController(context.container!.get<TodoStore>('todoStore'))
});
