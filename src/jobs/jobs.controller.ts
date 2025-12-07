import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import {
  JobsService,
  JobConversationResult,
  JobCreationResult,
  ExportCandidatesResult,
} from './jobs.service';
import {
  JobConversationDto,
  CreateJobDto,
  ExportCandidatesToClickUpDto,
} from './dto/job.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * Endpoint para conversa de criação de vaga
   * POST /jobs/chat
   */
  @Post('chat')
  @HttpCode(200)
  async processJobConversation(
    @Body() dto: JobConversationDto,
  ): Promise<JobConversationResult> {
    return this.jobsService.processJobConversation(
      dto.message,
      dto.conversationHistory || [],
      dto.currentJobData || {},
    );
  }

  /**
   * Endpoint para criar vaga e lista no ClickUp
   * POST /jobs/create
   */
  @Post('create')
  @HttpCode(200)
  async createJob(@Body() dto: CreateJobDto): Promise<JobCreationResult> {
    return this.jobsService.createJob(dto);
  }

  /**
   * Endpoint para exportar candidatos selecionados para o ClickUp
   * POST /jobs/export-candidates
   */
  @Post('export-candidates')
  @HttpCode(200)
  async exportCandidates(
    @Body() dto: ExportCandidatesToClickUpDto,
  ): Promise<ExportCandidatesResult> {
    return this.jobsService.exportCandidatesToClickUp(
      dto.clickUpListId,
      dto.jobTitle,
      dto.candidates,
    );
  }
}
