import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClickHouseModule } from './clickhouse/clickhouse.module';
import { OpenAIModule } from './openai/openai.module';
import { NaturalQueryModule } from './natural-query/natural-query.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClickHouseModule,
    OpenAIModule,
    NaturalQueryModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
