import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateJobDto } from './dto/job.dto';

export interface ClickUpTask {
  id: string;
  name: string;
  url: string;
  list: {
    id: string;
    name: string;
  };
}

export interface ClickUpList {
  id: string;
  name: string;
  url: string;
}

@Injectable()
export class ClickUpService {
  private readonly logger = new Logger(ClickUpService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.clickup.com/api/v2';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('CLICKUP_API_KEY') || '';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`ClickUp API error: ${response.status} - ${error}`);
      throw new Error(`ClickUp API error: ${response.status}`);
    }

    return response.json();
  }

  async createListForJob(
    folderId: string,
    jobTitle: string,
  ): Promise<ClickUpList> {
    this.logger.log(`Criando lista no ClickUp para vaga: ${jobTitle}`);

    const listName = `[VAGA] ${jobTitle} - ${new Date().toLocaleDateString('pt-BR')}`;

    const result = await this.request<ClickUpList>(`/folder/${folderId}/list`, {
      method: 'POST',
      body: JSON.stringify({
        name: listName,
        content: `Lista de candidatos para a vaga: ${jobTitle}`,
      }),
    });

    this.logger.log(`Lista criada: ${result.id} - ${result.name}`);
    return result;
  }

  async createJobDescriptionTask(
    listId: string,
    jobData: CreateJobDto,
  ): Promise<ClickUpTask> {
    this.logger.log(`Criando task de descrição da vaga na lista: ${listId}`);

    const description = this.formatJobDescription(jobData);

    const tags = ['vaga'];
    if (jobData.seniority) tags.push(jobData.seniority.toLowerCase());
    if (jobData.area) tags.push(jobData.area.toLowerCase());

    const result = await this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify({
        name: `📋 Descrição da Vaga: ${jobData.title}`,
        description,
        priority: 3, // Normal
        tags,
      }),
    });

    this.logger.log(`Task criada: ${result.id}`);
    return result;
  }

  async addCandidateTask(
    listId: string,
    candidate: {
      name: string;
      profileUrl: string;
      headline: string;
      currentCompany?: string;
      notes?: string;
    },
  ): Promise<ClickUpTask> {
    this.logger.log(`Adicionando candidato à lista: ${candidate.name}`);

    const description = `
**Perfil LinkedIn:** ${candidate.profileUrl}

**Headline:** ${candidate.headline}

${candidate.currentCompany ? `**Empresa Atual:** ${candidate.currentCompany}` : ''}

${candidate.notes ? `**Notas do Recrutador:**\n${candidate.notes}` : ''}
    `.trim();

    const result = await this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify({
        name: candidate.name,
        description,
        priority: 4, // Low (candidato novo)
        tags: ['candidato'],
      }),
    });

    return result;
  }

  private formatJobDescription(jobData: CreateJobDto): string {
    const sections: string[] = [];

    sections.push(`# ${jobData.title}`);

    // Informações Gerais
    const generalInfo: string[] = [];
    generalInfo.push(`- **Área:** ${jobData.area || 'Não informado'}`);
    generalInfo.push(
      `- **Senioridade:** ${jobData.seniority || 'Não informado'}`,
    );
    if (jobData.workFormat)
      generalInfo.push(
        `- **Formato:** ${jobData.workFormat}${jobData.hybridDays ? ` (${jobData.hybridDays})` : ''}`,
      );
    if (jobData.contractType)
      generalInfo.push(`- **Contrato:** ${jobData.contractType}`);
    if (jobData.salary) generalInfo.push(`- **Salário:** ${jobData.salary}`);
    if (jobData.benefits)
      generalInfo.push(`- **Benefícios:** ${jobData.benefits}`);
    sections.push(`## Informações Gerais\n${generalInfo.join('\n')}`);

    // Contexto
    if (jobData.openingReason || jobData.challenges || jobData.reportsTo) {
      const context: string[] = [];
      if (jobData.openingReason)
        context.push(`- **Motivo da Abertura:** ${jobData.openingReason}`);
      if (jobData.challenges)
        context.push(`- **Principais Desafios:** ${jobData.challenges}`);
      if (jobData.reportsTo)
        context.push(`- **Reporta para:** ${jobData.reportsTo}`);
      if (jobData.influenceOver)
        context.push(`- **Influência sobre:** ${jobData.influenceOver}`);
      sections.push(`## Contexto da Vaga\n${context.join('\n')}`);
    }

    // Responsabilidades
    if (jobData.responsibilities && jobData.responsibilities.length > 0) {
      sections.push(
        `## Responsabilidades Principais\n${jobData.responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
      );
    }

    // Entregas
    if (jobData.first3MonthsDeliverables) {
      sections.push(
        `## Entregas Esperadas (Primeiros 3 meses)\n${jobData.first3MonthsDeliverables}`,
      );
    }

    // Rotinas
    if (jobData.criticalRoutines) {
      sections.push(`## Rotinas Críticas\n${jobData.criticalRoutines}`);
    }

    // Requisitos Técnicos
    if (jobData.technicalSkills && jobData.technicalSkills.length > 0) {
      sections.push(
        `## Requisitos Técnicos\n${jobData.technicalSkills.map((s) => `- ${s}`).join('\n')}`,
      );
    }

    // Requisitos Comportamentais
    if (jobData.behavioralSkills && jobData.behavioralSkills.length > 0) {
      sections.push(
        `## Requisitos Comportamentais\n${jobData.behavioralSkills.map((s) => `- ${s}`).join('\n')}`,
      );
    }

    // Experiência Diferencial
    if (jobData.preferredExperience) {
      sections.push(
        `## Experiência Diferencial\n${jobData.preferredExperience}`,
      );
    }

    // Métricas
    if (jobData.metricsAndKPIs) {
      sections.push(`## Métricas e Indicadores\n${jobData.metricsAndKPIs}`);
    }

    // Observações
    if (jobData.additionalNotes) {
      sections.push(`## Observações Adicionais\n${jobData.additionalNotes}`);
    }

    sections.push(
      `---\n*Vaga criada em ${new Date().toLocaleDateString('pt-BR')} via AtrAI*`,
    );

    return sections.join('\n\n');
  }

  /**
   * Cria uma task com resumo dos candidatos (sem lista detalhada - essa vai no CSV)
   */
  async createCandidatesTask(
    listId: string,
    candidates: Array<{
      name: string;
      profileUrl: string;
      headline: string;
      currentCompany?: string;
      feedback?: 'interesting' | 'not_interesting';
      reason?: string;
    }>,
    jobTitle: string,
  ): Promise<ClickUpTask> {
    this.logger.log(`Criando task com ${candidates.length} candidatos`);

    const interestingCount = candidates.filter(
      (c) => c.feedback === 'interesting',
    ).length;
    const notInterestingCount = candidates.filter(
      (c) => c.feedback === 'not_interesting',
    ).length;
    const notEvaluatedCount =
      candidates.length - interestingCount - notInterestingCount;

    const description = `# Candidatos para ${jobTitle}

**📊 Resumo:**
- **Total de candidatos:** ${candidates.length}
- **✅ Marcados como interessantes:** ${interestingCount}
- **❌ Marcados como não interessantes:** ${notInterestingCount}
- **⏳ Não avaliados:** ${notEvaluatedCount}

---

📎 **A lista completa de candidatos está anexada no arquivo CSV.**

*Exportado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} via AtrAI*`;

    const result = await this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify({
        name: `👥 Candidatos - ${jobTitle} (${candidates.length})`,
        description,
        priority: 2, // High
        tags: ['candidatos', 'exportado'],
      }),
    });

    this.logger.log(`Task de candidatos criada: ${result.id}`);
    return result;
  }

  /**
   * Faz upload de um arquivo CSV para uma task
   */
  async uploadCsvAttachment(
    taskId: string,
    csvContent: string,
    filename: string,
  ): Promise<{ id: string; url: string }> {
    this.logger.log(`Fazendo upload do CSV para task: ${taskId}`);

    const url = `${this.baseUrl}/task/${taskId}/attachment`;

    // Cria um Blob com o conteúdo CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });

    // Cria FormData para o upload
    const formData = new FormData();
    formData.append('attachment', blob, filename);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        // Não definir Content-Type - o fetch define automaticamente com boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `ClickUp attachment error: ${response.status} - ${error}`,
      );
      throw new Error(`ClickUp attachment error: ${response.status}`);
    }

    const result = await response.json();
    this.logger.log(`Arquivo anexado: ${result.id}`);
    return result;
  }

  /**
   * Cria task com candidatos e anexa CSV
   */
  async createCandidatesTaskWithCsv(
    listId: string,
    candidates: Array<{
      name: string;
      profileUrl: string;
      headline: string;
      currentCompany?: string;
      feedback?: 'interesting' | 'not_interesting';
      reason?: string;
    }>,
    jobTitle: string,
  ): Promise<{ task: ClickUpTask; attachmentUrl?: string }> {
    // Cria a task primeiro
    const task = await this.createCandidatesTask(listId, candidates, jobTitle);

    // Gera o CSV
    const csvHeader = 'Nome,LinkedIn,Headline,Empresa,Avaliação,Motivo';
    const csvRows = candidates.map((c) => {
      const feedback =
        c.feedback === 'interesting'
          ? 'Interessante'
          : c.feedback === 'not_interesting'
            ? 'Não Interessante'
            : '';
      return [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.profileUrl || '').replace(/"/g, '""')}"`,
        `"${(c.headline || '').replace(/"/g, '""')}"`,
        `"${(c.currentCompany || '').replace(/"/g, '""')}"`,
        `"${feedback}"`,
        `"${(c.reason || '').replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = [csvHeader, ...csvRows].join('\n');

    // Faz upload do CSV
    const filename = `candidatos_${jobTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    try {
      const attachment = await this.uploadCsvAttachment(
        task.id,
        csvContent,
        filename,
      );
      return { task, attachmentUrl: attachment.url };
    } catch (error) {
      this.logger.error(`Erro ao anexar CSV, continuando sem anexo: ${error}`);
      return { task };
    }
  }

  /**
   * Adiciona comentário com CSV em uma task
   */
  async addCommentWithCsv(
    taskId: string,
    csvContent: string,
    message: string,
  ): Promise<void> {
    this.logger.log(`Adicionando comentário com CSV na task: ${taskId}`);

    await this.request(`/task/${taskId}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        comment_text: `${message}\n\n\`\`\`csv\n${csvContent}\n\`\`\``,
      }),
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
