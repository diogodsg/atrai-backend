import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OPENAI_CLIENT } from '../openai/openai.module';
import { ClickUpService } from './clickup.service';
import {
  CreateJobDto,
  JobConversationMessageDto,
  CandidateDto,
} from './dto/job.dto';

export interface JobConversationResult {
  assistantMessage: string;
  currentJobData: Partial<CreateJobDto>;
  isComplete: boolean;
  missingFields: string[];
}

export interface JobCreationResult {
  job: CreateJobDto;
  clickUpListId?: string;
  clickUpListUrl?: string;
  clickUpTaskId?: string;
  clickUpTaskUrl?: string;
  searchQuery: string;
  clickUpCreated: boolean;
  clickUpError?: string;
}

export interface ExportCandidatesResult {
  success: boolean;
  clickUpTaskId?: string;
  clickUpTaskUrl?: string;
  attachmentUrl?: string;
  candidatesCount: number;
  error?: string;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly clickUpService: ClickUpService,
    private readonly configService: ConfigService,
  ) {}

  async processJobConversation(
    message: string,
    conversationHistory: JobConversationMessageDto[],
    currentJobData: Partial<CreateJobDto>,
  ): Promise<JobConversationResult> {
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

    const systemPrompt = `Você é um assistente de RH que coleta informações para criar vagas de forma RÁPIDA e EFICIENTE.

COLETE AS INFORMAÇÕES EM APENAS 4 PERGUNTAS AGRUPADAS:

**PERGUNTA 1 - Básico e Contexto:**
- title: Nome da vaga
- area: Área (Tecnologia, Produto, Vendas, CS, Marketing, RH, Financeiro, etc.)
- seniority: Junior, Pleno ou Sênior
- openingReason: Substituição, Aumento de time ou Novo projeto (opcional)
- reportsTo: Para quem reporta (opcional)

**PERGUNTA 2 - O que vai fazer:**
- responsibilities: Principais responsabilidades (opcional)
- challenges: Principais desafios (opcional)

**PERGUNTA 3 - Requisitos:**
- technicalSkills: Conhecimentos técnicos (opcional)
- behavioralSkills: Competências comportamentais (opcional)
- preferredExperience: Experiência diferencial (opcional)

**PERGUNTA 4 - Logística e Remuneração:**
- workFormat: Presencial, Híbrido ou Remoto (se híbrido, quantos dias)
- salary: Faixa salarial
- benefits: Benefícios (opcional)
- contractType: CLT, PJ ou Estágio

DADOS JÁ COLETADOS:
${JSON.stringify(currentJobData, null, 2)}

REGRAS IMPORTANTES:
- Faça APENAS 4 perguntas no total, agrupando múltiplos campos por pergunta
- Extraia TODOS os campos mencionados na resposta do usuário
- Seja direto e objetivo
- Se o usuário responder várias coisas de uma vez, extraia tudo
- CAMPOS OBRIGATÓRIOS: title, area, seniority, workFormat, salary, contractType
- Quando tiver TODOS os 6 campos obrigatórios acima preenchidos, marque isComplete = true e faça um resumo da vaga pedindo confirmação

Responda em JSON:
{
  "assistantMessage": "Sua pergunta agrupada ou resumo para confirmação",
  "extractedData": { todos os campos extraídos desta mensagem },
  "isComplete": true ou false (true APENAS se todos os 6 campos obrigatórios estiverem preenchidos),
  "nextQuestion": "qual grupo de perguntas falta"
}`;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: message });

    const response = await this.openai.chat.completions.create({
      model,
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI não retornou uma resposta válida');
    }

    let parsed: {
      assistantMessage: string;
      extractedData: Partial<CreateJobDto>;
      isComplete: boolean;
      nextQuestion: string;
    };

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Se não conseguir parsear, retorna a mensagem como está
        return {
          assistantMessage: content,
          currentJobData,
          isComplete: false,
          missingFields: this.getMissingFields(currentJobData),
        };
      }
    }

    // Merge dados extraídos
    const updatedJobData = {
      ...currentJobData,
      ...parsed.extractedData,
    };

    const missingFields = this.getMissingFields(updatedJobData);

    this.logger.log(
      `Campos extraídos: ${JSON.stringify(parsed.extractedData)}`,
    );
    this.logger.log(`Dados atualizados: ${JSON.stringify(updatedJobData)}`);
    this.logger.log(`Campos faltando: ${JSON.stringify(missingFields)}`);
    this.logger.log(
      `OpenAI isComplete: ${parsed.isComplete}, missingFields.length: ${missingFields.length}`,
    );

    // Se não há mais campos faltando, força isComplete = true
    const isComplete = missingFields.length === 0;

    return {
      assistantMessage: parsed.assistantMessage,
      currentJobData: updatedJobData,
      isComplete,
      missingFields,
    };
  }

  async createJob(jobData: CreateJobDto): Promise<JobCreationResult> {
    this.logger.log(`Criando vaga: ${jobData.title}`);

    let clickUpListId: string | undefined;
    let clickUpListUrl: string | undefined;
    let clickUpTaskId: string | undefined;
    let clickUpTaskUrl: string | undefined;
    let clickUpCreated = false;
    let clickUpError: string | undefined;

    // Cria lista no ClickUp se configurado
    if (this.clickUpService.isConfigured()) {
      const folderId = this.configService.get<string>('CLICKUP_FOLDER_ID');
      if (folderId) {
        try {
          const list = await this.clickUpService.createListForJob(
            folderId,
            jobData.title,
          );
          clickUpListId = list.id;
          clickUpListUrl = `https://app.clickup.com/${list.id}`;

          // Cria task com descrição da vaga
          const task = await this.clickUpService.createJobDescriptionTask(
            list.id,
            jobData,
          );
          clickUpTaskId = task.id;
          clickUpTaskUrl = task.url;
          clickUpCreated = true;

          this.logger.log(
            `Lista ClickUp criada: ${clickUpListId}, Task: ${clickUpTaskId}`,
          );
        } catch (error) {
          clickUpError = error instanceof Error ? error.message : String(error);
          this.logger.error(`Erro ao criar lista no ClickUp: ${clickUpError}`);
        }
      } else {
        clickUpError = 'CLICKUP_FOLDER_ID não configurado';
      }
    } else {
      clickUpError = 'ClickUp não configurado (falta CLICKUP_API_KEY)';
    }

    // Gera query de busca baseada na vaga
    const searchQuery = this.generateSearchQuery(jobData);

    return {
      job: jobData,
      clickUpListId,
      clickUpListUrl,
      clickUpTaskId,
      clickUpTaskUrl,
      searchQuery,
      clickUpCreated,
      clickUpError,
    };
  }

  private getMissingFields(jobData: Partial<CreateJobDto>): string[] {
    // Campos mínimos obrigatórios para criar a vaga
    const requiredFields = [
      'title',
      'area',
      'seniority',
      'workFormat',
      'salary',
      'contractType',
    ];

    return requiredFields.filter((field) => {
      const value = jobData[field as keyof CreateJobDto];
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return !value;
    });
  }

  private generateSearchQuery(jobData: CreateJobDto): string {
    const parts: string[] = [];

    parts.push(`Busque ${jobData.title}`);

    if (jobData.seniority) {
      parts.push(`nível ${jobData.seniority}`);
    }

    if (jobData.technicalSkills && jobData.technicalSkills.length > 0) {
      parts.push(
        `com conhecimento em ${jobData.technicalSkills.slice(0, 3).join(', ')}`,
      );
    }

    if (jobData.preferredExperience) {
      parts.push(`preferencialmente com ${jobData.preferredExperience}`);
    }

    return parts.join(' ');
  }

  async exportCandidatesToClickUp(
    clickUpListId: string,
    jobTitle: string,
    candidates: CandidateDto[],
  ): Promise<ExportCandidatesResult> {
    this.logger.log(
      `Exportando ${candidates.length} candidatos para ClickUp lista ${clickUpListId}`,
    );

    if (!this.clickUpService.isConfigured()) {
      return {
        success: false,
        candidatesCount: candidates.length,
        error: 'ClickUp não configurado',
      };
    }

    try {
      const result = await this.clickUpService.createCandidatesTaskWithCsv(
        clickUpListId,
        candidates.map((c) => ({
          name: c.name,
          profileUrl: c.profileUrl,
          headline: c.headline || '',
          currentCompany: c.currentCompany,
          feedback: c.feedback,
          reason: c.reason,
        })),
        jobTitle,
      );

      return {
        success: true,
        clickUpTaskId: result.task.id,
        clickUpTaskUrl: result.task.url,
        candidatesCount: candidates.length,
        attachmentUrl: result.attachmentUrl,
      };
    } catch (error) {
      this.logger.error(`Erro ao exportar candidatos: ${error}`);
      return {
        success: false,
        candidatesCount: candidates.length,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
