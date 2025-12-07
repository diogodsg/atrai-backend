import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ClickUpService } from './clickup.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, ClickUpService],
  exports: [JobsService, ClickUpService],
})
export class JobsModule {}
