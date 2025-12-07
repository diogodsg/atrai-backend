import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export const OPENAI_CLIENT = 'OPENAI_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: OPENAI_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new OpenAI({
          apiKey: configService.get<string>('OPENAI_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [OPENAI_CLIENT],
})
export class OpenAIModule {}
