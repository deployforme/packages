import { Controller, Get, Version, defineModule } from '@hivelet/core';

@Controller('/runtime')
class RuntimeController {
  @Get('/health')
  @Version('1.0.0')
  health() {
    return { status: 'ok', service: 'nest-todo' };
  }

  @Get('/info')
  info() {
    return { runtime: 'hivelet', integration: 'nestjs' };
  }
}

export default defineModule({
  name: 'runtime',
  version: '1.0.0',
  controllers: () => new RuntimeController()
});
