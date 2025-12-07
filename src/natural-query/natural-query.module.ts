import { Module } from '@nestjs/common';
import { NaturalQueryService } from './natural-query.service';
import { NaturalQueryController } from './natural-query.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [NaturalQueryController],
  providers: [NaturalQueryService],
  exports: [NaturalQueryService],
})
export class NaturalQueryModule {}
