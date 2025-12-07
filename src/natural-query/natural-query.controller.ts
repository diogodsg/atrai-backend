import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  NaturalQueryService,
  QueryResult,
  ConversationResult,
} from './natural-query.service';
import {
  NaturalQueryDto,
  ConversationQueryDto,
  ExportCsvDto,
  ExportToClickUpDto,
} from './dto/query.dto';
import { ClickUpService } from '../jobs/clickup.service';

@Controller('query')
export class NaturalQueryController {
  constructor(
    private readonly naturalQueryService: NaturalQueryService,
    private readonly clickUpService: ClickUpService,
  ) {}

  /**
   * Endpoint principal para busca conversacional com refinamento
   * POST /query/chat
   *
   * Body:
   * {
   *   "message": "Preciso de desenvolvedores Python senior",
   *   "conversationHistory": [
   *     { "role": "user", "content": "mensagem anterior" },
   *     { "role": "assistant", "content": "resposta anterior" }
   *   ],
   *   "profileFeedback": [
   *     { "profileId": "abc123", "profileName": "João Silva", "interesting": true, "reason": "boa experiência" },
   *     { "profileId": "def456", "profileName": "Maria Santos", "interesting": false, "reason": "muito junior" }
   *   ]
   * }
   */
  @Post('chat')
  @HttpCode(200)
  async conversationalSearch(
    @Body() dto: ConversationQueryDto,
  ): Promise<ConversationResult> {
    return this.naturalQueryService.conversationalSearch(
      dto.message,
      dto.conversationHistory || [],
      dto.profileFeedback || [],
    );
  }

  /**
   * Endpoint para exportar resultados em CSV (até 2000 perfis)
   * POST /query/export
   *
   * Body:
   * {
   *   "conversationHistory": [...],
   *   "profileFeedback": [...]
   * }
   */
  @Post('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="candidatos.csv"')
  async exportToCsv(
    @Body() dto: ExportCsvDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.naturalQueryService.exportToCsv(
      dto.conversationHistory || [],
      dto.profileFeedback || [],
    );
    res.send(csv);
  }

  /**
   * Endpoint simples para processar queries em linguagem natural
   * POST /query
   *
   * Body:
   * {
   *   "query": "Encontre todas as pessoas que trabalham com tecnologia em São Paulo",
   *   "executeQuery": true
   * }
   */
  @Post()
  @HttpCode(200)
  async processQuery(
    @Body() dto: NaturalQueryDto,
  ): Promise<QueryResult | { sql: string; explanation: string }> {
    if (dto.executeQuery === false) {
      return this.naturalQueryService.explainQuery(dto.query);
    }

    return this.naturalQueryService.generateAndExecuteQuery(dto.query);
  }

  /**
   * Endpoint GET para queries simples via query string
   * GET /query?q=Mostre empresas de tecnologia com mais de 100 funcionários
   */
  @Get()
  async processQueryGet(
    @Query('q') query: string,
    @Query('execute') execute: string = 'true',
  ): Promise<QueryResult | { sql: string; explanation: string }> {
    if (!query) {
      throw new Error('Query parameter "q" is required');
    }

    const shouldExecute = execute !== 'false';

    if (!shouldExecute) {
      return this.naturalQueryService.explainQuery(query);
    }

    return this.naturalQueryService.generateAndExecuteQuery(query);
  }

  /**
   * Endpoint para apenas gerar a query SQL sem executar
   * POST /query/explain
   */
  @Post('explain')
  @HttpCode(200)
  async explainQuery(
    @Body() dto: NaturalQueryDto,
  ): Promise<{ sql: string; explanation: string }> {
    return this.naturalQueryService.explainQuery(dto.query);
  }

  /**
   * Endpoint para exportar TODOS os candidatos do filtro para o ClickUp
   * POST /query/export-clickup
   *
   * Body:
   * {
   *   "clickUpListId": "12345678",
   *   "jobTitle": "Tech Lead",
   *   "conversationHistory": [...],
   *   "profileFeedback": [...]
   * }
   */
  @Post('export-clickup')
  @HttpCode(200)
  async exportToClickUp(@Body() dto: ExportToClickUpDto): Promise<{
    success: boolean;
    clickUpTaskId?: string;
    clickUpTaskUrl?: string;
    candidatesCount: number;
    error?: string;
  }> {
    return this.naturalQueryService.exportToClickUp(
      dto.clickUpListId,
      dto.jobTitle,
      dto.conversationHistory || [],
      dto.profileFeedback || [],
      this.clickUpService,
    );
  }
}
