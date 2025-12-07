import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OPENAI_CLIENT } from '../openai/openai.module';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import { MessageDto, ProfileFeedbackDto } from './dto/query.dto';

export interface QueryResult {
  query: string;
  explanation: string;
  data: any[];
  totalRows: number;
}

export interface ConversationResult extends QueryResult {
  assistantMessage: string;
  searchCriteria: string;
}

@Injectable()
export class NaturalQueryService {
  private readonly logger = new Logger(NaturalQueryService.name);

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly clickhouseService: ClickHouseService,
    private readonly configService: ConfigService,
  ) {}

  private async getSchemaContext(): Promise<string> {
    // Definição das tabelas de pessoas e empresas do LinkedIn
    const schema = `
Você tem acesso a um banco de dados ClickHouse com dados do LinkedIn.
Este é um agente de RECRUTAMENTO - foque em encontrar candidatos ideais baseado em habilidades, experiência, formação e perfil profissional.

=== TABELA PRINCIPAL: linkedin.people ===

Descrição: Tabela de perfis de usuários do LinkedIn para análise e segmentação de profissionais para fins de recrutamento, prospecção e inteligência de mercado.

COLUNAS:
- profile_id (String) - Identificador interno único do perfil (CHAVE PRIMÁRIA LÓGICA - use sempre como identificador estável)
- profile_public_id (String) - Identificador público único do perfil no LinkedIn (pode mudar com renomeações)
- first_name (String) - Primeiro nome do profissional
- last_name (String) - Sobrenome do profissional
- full_name (String) - Nome completo exibido no perfil
- headline (String) - Título profissional exibido abaixo do nome (IMPORTANTE para buscar cargos e especialidades)
- about_me (String) - Resumo textual sobre o profissional (pode ser nulo/vazio - normalize e use ILIKE)
- profile_url (String) - URL pública do perfil no LinkedIn
- profile_image_url (String) - URL da foto principal do perfil (pode estar vazia - use apenas para enriquecimento visual)
- current_job_title (String) - Cargo atual principal informado no perfil
- current_company (String) - Nome da empresa atual principal (pode ser inconsistente - escrito à mão sem ID)
- current_company_url (String) - URL pública da página da empresa atual
- current_company_public_id (String) - Identificador público da empresa no LinkedIn
- current_company_id (Int64) - Identificador interno da empresa (PREFIRA para joins determinísticos)
- current_company_logo_url (String) - URL do logo da empresa atual

CLASSIFICAÇÕES DE ÁREA:
- macroarea (String) - Macroárea funcional classificada
  Valores: ADMINISTRACAO, ENGENHARIA E CONSTRUCAO, MARKETING E VENDAS, N/A, OPERACOES E INDUSTRIA, TECNOLOGIA, DADOS E PRODUTOS
- area (String) - Área funcional específica classificada
  Valores: ADMINISTRATIVO, ATENDIMENTO AO CLIENTE, AUDITORIA, COMPLIANCE, COMPRAS, CONSELHO, CONSTRUCAO, CONSULTORIA, CONTABILIDADE, CONTROLADORIA, CYBERSEGURANCA, DADOS, DESENVOLVIMENTO, DESIGN, ENGENHARIA, FINANCEIRO, INDUSTRIAL, INFRAESTRUTURA, INOVACAO, INTELIGENCIA DE MERCADO, JURIDICO, LOGISTICA, MANUTENCAO, MARKETING, N/A, NOVOS NEGOCIOS, OPERACOES, PLANEJAMENTO E PERFORMANCE, PLANEJAMENTO FINANCEIRO, PRESIDENCIA, PRODUTOS, QUALIDADE, RECURSOS HUMANOS, SAUDE, SEGURANCA E MEIO AMBIENTE, SOCIO, SUPORTE, TECNOLOGIA, TRANSPORTES, VENDAS
- area_probability (Float64) - Probabilidade associada à classificação da área

SENIORIDADE:
- seniority (String) - Nível de senioridade classificado
  Valores: ANALISTA, C-SUITE / DIRETOR, COORDENADOR, ESPECIALISTA, ESTAGIARIO / TRAINEE, GERENTE, OUTROS, SUPERVISOR
- seniority_order (Int32) - Ordem hierárquica numérica da senioridade (maior = mais senior)
- seniority_probability (Float64) - Probabilidade associada à classificação

LOCALIZAÇÃO:
- city (String) - Cidade em MAIÚSCULAS (ex: SAO PAULO, CAMPINAS, RIO DE JANEIRO)
- state (String) - Estado em MAIÚSCULAS (ex: SAO PAULO, RIO DE JANEIRO, MINAS GERAIS, PARANA, SANTA CATARINA)
- country (String) - País (valor: BRASIL)

HISTÓRICO PROFISSIONAL:
- experience (String) - Histórico de experiências profissionais (JSON/texto estruturado) - MUITO IMPORTANTE para buscar experiência em empresas/tecnologias
- education (String) - Histórico de formação acadêmica (JSON/texto estruturado) - para filtrar universidade/curso
- certifications (String) - Lista de certificações profissionais (AWS, Google, Microsoft, etc)
- updated_at (String) - Data da última atualização (formato: YYYY-MM-DD)

=== REGRAS IMPORTANTES PARA QUERIES ===

BOAS PRÁTICAS:
1. Use profile_id como identificador estável (profile_public_id e profile_url podem mudar)
2. Para joins com empresas, prefira current_company_id (use current_company_public_id como fallback se ID nulo)
3. Campos de texto (headline, about_me, full_name, current_job_title) podem ser nulos/vazios
4. Para buscas em texto, normalize: LOWER() + TRIM() + ILIKE '%termo%' (evite igualdade exata)
5. Cidades e estados estão em MAIÚSCULAS (use UPPER() ou busque já em maiúsculas)

SINTAXE CLICKHOUSE:
- Use ILIKE para busca case-insensitive (não precisa LOWER com ILIKE)
- Use OR para combinar múltiplos campos de busca
- Sempre limite com LIMIT (máximo 100 por padrão)
- Para ordenar por senioridade: ORDER BY seniority_order DESC

PADRÕES DE BUSCA:
- Habilidades/tecnologias: (headline ILIKE '%python%' OR about_me ILIKE '%python%' OR experience ILIKE '%python%' OR current_job_title ILIKE '%python%')
- Formação específica: education ILIKE '%usp%' OR education ILIKE '%unicamp%'
- Experiência em empresa: experience ILIKE '%nubank%' OR experience ILIKE '%itau%'
- Certificações: certifications ILIKE '%aws%' OR certifications ILIKE '%azure%'
- Cargo específico: current_job_title ILIKE '%data scientist%' OR headline ILIKE '%data scientist%'
- Localização: city = 'SAO PAULO' AND state = 'SAO PAULO'
- Senioridade: seniority IN ('GERENTE', 'C-SUITE / DIRETOR') ou seniority_order >= 5
- Área de atuação: area = 'DADOS' AND macroarea = 'TECNOLOGIA, DADOS E PRODUTOS'

=== EXEMPLOS DE QUERIES ===

1. Tech Leads em Curitiba (busca por CARGO ESPECÍFICO - SEM ordenar por seniority):
SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, area, macroarea, city, state, profile_url, profile_image_url
FROM linkedin.people
WHERE current_job_title ILIKE '%tech lead%'
  AND city = 'CURITIBA'
  AND state = 'PARANA'
ORDER BY full_name ASC
LIMIT 7;

2. Data Scientists Senior em São Paulo (busca por PERFIL com filtro de senioridade):
SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, city, state, profile_url, profile_image_url
FROM linkedin.people
WHERE (current_job_title ILIKE '%data scientist%' OR current_job_title ILIKE '%cientista de dados%')
  AND seniority IN ('ESPECIALISTA', 'GERENTE', 'COORDENADOR')
  AND state = 'SAO PAULO'
ORDER BY full_name ASC
LIMIT 7;

3. Desenvolvedores Backend com experiência em fintechs:
SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, city, state, profile_url, profile_image_url
FROM linkedin.people
WHERE (current_job_title ILIKE '%backend%' OR current_job_title ILIKE '%back-end%' OR current_job_title ILIKE '%back end%')
  AND (experience ILIKE '%fintech%' OR experience ILIKE '%nubank%' OR experience ILIKE '%pagar.me%' OR experience ILIKE '%stone%')
ORDER BY full_name ASC
LIMIT 7;

4. Product Managers (busca por cargo específico):
SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, area, macroarea, city, state, profile_url, profile_image_url
FROM linkedin.people
WHERE current_job_title ILIKE '%product manager%'
  AND state = 'SAO PAULO'
ORDER BY full_name ASC
LIMIT 7;

=== CAMPOS PARA RETORNAR ===
Sempre inclua estes campos úteis para recrutamento:
profile_id, full_name, headline, current_job_title, current_company, seniority, area, macroarea, city, state, profile_url, profile_image_url
`;
    return schema;
  }

  async generateAndExecuteQuery(
    naturalLanguageQuery: string,
  ): Promise<QueryResult> {
    const schemaContext = await this.getSchemaContext();
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

    const systemPrompt = `${schemaContext}

Você é um assistente especializado em converter perguntas em linguagem natural para queries SQL ClickHouse.

Responda APENAS em formato JSON válido com a seguinte estrutura:
{
  "sql": "SELECT ... FROM ... WHERE ... LIMIT ...",
  "explanation": "Explicação breve do que a query faz"
}

Não inclua nenhum texto antes ou depois do JSON.
Não use markdown code blocks.
A query deve ser segura e apenas de leitura (SELECT).`;

    this.logger.log(`Processando query: "${naturalLanguageQuery}"`);

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: naturalLanguageQuery },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI não retornou uma resposta válida');
    }

    this.logger.debug(`Resposta OpenAI: ${content}`);

    let parsed: { sql: string; explanation: string };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Tenta extrair JSON de possível markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(
          `Não foi possível parsear resposta da OpenAI: ${content}`,
        );
      }
    }

    if (!parsed.sql) {
      throw new Error('A resposta não contém uma query SQL');
    }

    // Validação básica de segurança
    const sqlUpper = parsed.sql.toUpperCase();

    this.logger.log(`Executando query: ${parsed.sql}`);

    // Executa a query no ClickHouse
    const data = await this.clickhouseService.query<any>(parsed.sql);

    return {
      query: parsed.sql,
      explanation: parsed.explanation,
      data,
      totalRows: data.length,
    };
  }

  async explainQuery(naturalLanguageQuery: string): Promise<{
    sql: string;
    explanation: string;
  }> {
    const schemaContext = await this.getSchemaContext();
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

    const systemPrompt = `${schemaContext}

Você é um assistente especializado em converter perguntas em linguagem natural para queries SQL ClickHouse.

Responda APENAS em formato JSON válido com a seguinte estrutura:
{
  "sql": "SELECT ... FROM ... WHERE ... LIMIT ...",
  "explanation": "Explicação detalhada do que a query faz e por que foi construída dessa forma"
}

Não inclua nenhum texto antes ou depois do JSON.
Não use markdown code blocks.`;

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: naturalLanguageQuery },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI não retornou uma resposta válida');
    }

    let parsed: { sql: string; explanation: string };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(
          `Não foi possível parsear resposta da OpenAI: ${content}`,
        );
      }
    }

    return parsed;
  }

  async conversationalSearch(
    message: string,
    conversationHistory: MessageDto[] = [],
    profileFeedback: ProfileFeedbackDto[] = [],
  ): Promise<ConversationResult> {
    const schemaContext = await this.getSchemaContext();
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

    // Monta contexto de feedback dos perfis
    let feedbackContext = '';
    if (profileFeedback.length > 0) {
      const interesting = profileFeedback.filter((f) => f.interesting);
      const notInteresting = profileFeedback.filter((f) => !f.interesting);

      if (interesting.length > 0) {
        feedbackContext += `\n\nPERFIS MARCADOS COMO INTERESSANTES pelo recrutador:\n`;
        interesting.forEach((f) => {
          feedbackContext += `- ${f.profileName} (ID: ${f.profileId})${f.reason ? ` - Motivo: ${f.reason}` : ''}\n`;
        });
      }

      if (notInteresting.length > 0) {
        feedbackContext += `\n\nPERFIS MARCADOS COMO NÃO INTERESSANTES pelo recrutador:\n`;
        notInteresting.forEach((f) => {
          feedbackContext += `- ${f.profileName} (ID: ${f.profileId})${f.reason ? ` - Motivo: ${f.reason}` : ''}\n`;
        });
      }

      feedbackContext += `\nUse esse feedback para entender o padrão de perfis que o recrutador busca e refinar a query.`;
      feedbackContext += `\nExclua os perfis já avaliados dos resultados usando: profile_id NOT IN ('id1', 'id2', ...)`;
    }

    const systemPrompt = `${schemaContext}
${feedbackContext}

Você é um assistente de RECRUTAMENTO especializado em ajudar recrutadores a encontrar candidatos ideais.

Seu trabalho é:
1. Entender o que o recrutador está buscando através da conversa
2. Gerar queries SQL ClickHouse para encontrar candidatos
3. Aprender com o feedback (perfis interessantes vs não interessantes) para refinar as buscas
4. Sugerir refinamentos e fazer perguntas para entender melhor o perfil desejado

Responda SEMPRE em formato JSON válido com a seguinte estrutura:
{
  "sql": "SELECT ... FROM linkedin.people WHERE ... LIMIT 7",
  "countSql": "SELECT COUNT(*) as total FROM linkedin.people WHERE ...",
  "explanation": "Explicação breve da query",
  "assistantMessage": "Mensagem conversacional para o recrutador explicando os resultados e/ou fazendo perguntas para refinar",
  "searchCriteria": "Resumo dos critérios de busca atuais em bullet points"
}

Regras IMPORTANTES:
- Sempre inclua profile_id, full_name, headline, current_job_title, current_company, seniority, area, macroarea, city, state, profile_url, profile_image_url nos resultados
- LIMITE A 7 RESULTADOS na query sql (LIMIT 7) para facilitar avaliação rápida
- A countSql deve ter os mesmos filtros WHERE da sql, mas apenas contar o total (sem LIMIT)
- Se houver perfis já avaliados, exclua-os da busca
- Seja conversacional e proativo - sugira refinamentos baseado no feedback
- Pergunte sobre critérios que podem ajudar: senioridade, localização, tecnologias específicas, tipo de empresa, etc.
- Use os motivos dos feedbacks para entender o que o recrutador valoriza ou não valoriza

REGRA CRÍTICA PARA CARGOS ESPECÍFICOS:
- Quando o usuário busca um cargo específico (ex: "Tech Lead", "Product Manager", "Data Scientist"), o cargo ATUAL deve conter EXATAMENTE esse termo
- Use current_job_title ILIKE '%tech lead%' como filtro OBRIGATÓRIO, não apenas headline
- NÃO ordene por seniority_order DESC quando buscar cargo específico - isso traz CTOs e C-Level em vez do cargo pedido
- Se o usuário pede "Tech Lead", ele quer pessoas que SÃO Tech Leads HOJE, não CTOs ou VPs
- A ordenação deve ser por relevância do cargo, não por senioridade hierárquica
- Use ORDER BY full_name ou deixe sem ordenação específica para cargos específicos

EXEMPLOS DE BUSCA POR CARGO ESPECÍFICO:
- "Tech Leads em Curitiba" → WHERE current_job_title ILIKE '%tech lead%' AND city = 'CURITIBA'
- "Product Managers" → WHERE current_job_title ILIKE '%product manager%'
- NÃO inclua ORDER BY seniority_order DESC para esses casos

ESTRATÉGIA PARA EVITAR RESULTADOS VAZIOS:
- NUNCA combine muitos filtros restritivos de uma vez (área AND formação AND senioridade AND localização)
- Use OR entre critérios alternativos em vez de AND quando possível
- PRIORIZE critérios: cargo/headline > experiência > área classificada > formação > localização
- Se o recrutador pedir muitos critérios, comece pelos mais importantes e avise que pode refinar depois
- Prefira ILIKE com termos amplos antes de usar campos classificados exatos
- Campos classificados (area, macroarea, seniority) são úteis mas MUITO restritivos - use com cuidado
- Se precisar de formação específica, use como critério de ordenação/preferência, não como filtro obrigatório
- Formação em education é texto livre - muitos perfis não têm essa informação preenchida

Na assistantMessage, sempre informe:
- Quantos critérios foram aplicados e quais
- Se algum critério foi relaxado para encontrar resultados
- Sugestões de como refinar a busca

Não inclua texto antes ou depois do JSON. Não use markdown code blocks.`;

    // Monta histórico de mensagens
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Adiciona histórico da conversa
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Adiciona mensagem atual
    messages.push({ role: 'user', content: message });

    this.logger.log(`Processando busca conversacional: "${message}"`);
    this.logger.debug(`Histórico: ${conversationHistory.length} mensagens`);
    this.logger.debug(`Feedback: ${profileFeedback.length} perfis avaliados`);

    const response = await this.openai.chat.completions.create({
      model,
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI não retornou uma resposta válida');
    }

    this.logger.debug(`Resposta OpenAI: ${content}`);

    let parsed: {
      sql: string;
      countSql?: string;
      explanation: string;
      assistantMessage: string;
      searchCriteria: string;
    };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(
          `Não foi possível parsear resposta da OpenAI: ${content}`,
        );
      }
    }

    if (!parsed.sql) {
      throw new Error('A resposta não contém uma query SQL');
    }

    this.logger.log(`Executando query: ${parsed.sql}`);

    // Executa a query no ClickHouse
    let data = await this.clickhouseService.query<any>(parsed.sql);

    // Se retornou vazio, tenta uma busca mais relaxada
    if (data.length === 0) {
      this.logger.log('Query retornou vazio, tentando busca mais relaxada...');

      const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
        ...messages,
        { role: 'assistant', content: content },
        {
          role: 'user',
          content: `A query retornou 0 resultados. Por favor, RELAXE os critérios para encontrar candidatos:
1. Remova o filtro de formação/education (muitos perfis não têm isso preenchido)
2. Use apenas ILIKE em headline/current_job_title em vez de filtrar por area/macroarea classificados
3. Amplie a senioridade para incluir mais níveis
4. Remova filtros de localização se houver
5. Mantenha apenas o critério principal (cargo/função)

Gere uma nova query mais ampla que retorne resultados. Na assistantMessage, explique que relaxou os critérios porque a busca anterior era muito restritiva.`,
        },
      ];

      const retryResponse = await this.openai.chat.completions.create({
        model,
        messages: retryMessages,
      });

      const retryContent = retryResponse.choices[0]?.message?.content?.trim();
      if (retryContent) {
        try {
          const retryParsed = JSON.parse(
            retryContent.match(/\{[\s\S]*\}/)?.[0] || retryContent,
          );
          if (retryParsed.sql) {
            this.logger.log(`Executando query relaxada: ${retryParsed.sql}`);
            const retryData = await this.clickhouseService.query<any>(
              retryParsed.sql,
            );

            if (retryData.length > 0) {
              data = retryData;
              parsed = retryParsed;
              // Adiciona aviso na mensagem
              if (
                !parsed.assistantMessage.includes('relaxe') &&
                !parsed.assistantMessage.includes('ampli')
              ) {
                parsed.assistantMessage = `⚠️ A busca original era muito restritiva e não encontrou resultados. Relaxei alguns critérios para trazer candidatos.\n\n${parsed.assistantMessage}`;
              }
            }
          }
        } catch (retryError) {
          this.logger.warn(`Erro no retry: ${retryError}`);
        }
      }
    }

    // Conta o total de resultados (se countSql fornecida)
    let totalRows = data.length;
    if (parsed.countSql) {
      try {
        this.logger.log(`Contando total: ${parsed.countSql}`);
        const countResult = await this.clickhouseService.query<{
          total: number;
        }>(parsed.countSql);
        if (countResult.length > 0 && countResult[0].total !== undefined) {
          totalRows = Number(countResult[0].total);
        }
      } catch (countError) {
        this.logger.warn(`Erro ao contar total: ${countError}`);
      }
    }

    return {
      query: parsed.sql,
      explanation: parsed.explanation,
      data,
      totalRows,
      assistantMessage: parsed.assistantMessage,
      searchCriteria: parsed.searchCriteria,
    };
  }

  async exportToCsv(
    conversationHistory: MessageDto[],
    profileFeedback: ProfileFeedbackDto[],
  ): Promise<string> {
    const schemaContext = await this.getSchemaContext();
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

    // Monta contexto de feedback
    let feedbackContext = '';
    if (profileFeedback.length > 0) {
      const interesting = profileFeedback.filter((f) => f.interesting);
      const notInteresting = profileFeedback.filter((f) => !f.interesting);

      feedbackContext = `\n\nFeedback do recrutador sobre perfis:\n`;
      if (interesting.length > 0) {
        feedbackContext += `- Perfis INTERESSANTES: ${interesting.map((f) => `${f.profileName}${f.reason ? ` (${f.reason})` : ''}`).join(', ')}\n`;
      }
      if (notInteresting.length > 0) {
        feedbackContext += `- Perfis NÃO INTERESSANTES: ${notInteresting.map((f) => `${f.profileName}${f.reason ? ` (${f.reason})` : ''}`).join(', ')}\n`;
      }
    }

    const systemPrompt = `${schemaContext}${feedbackContext}

Você é um assistente de RECRUTAMENTO. Com base no histórico da conversa, gere uma query SQL ClickHouse para exportar TODOS os candidatos que atendem aos critérios (LIMITADO A 2000 resultados).

Responda APENAS em formato JSON válido:
{
  "sql": "SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, area, city, state, profile_url FROM linkedin.people WHERE ... LIMIT 2000"
}

Regras:
- Inclua: profile_id, full_name, headline, current_job_title, current_company, seniority, area, city, state, profile_url
- LIMITE A 2000 RESULTADOS (LIMIT 2000)
- Se houver perfis não interessantes, exclua-os ou perfis similares
- Baseie-se nos critérios da conversa e no feedback

Não inclua texto antes ou depois do JSON.`;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    messages.push({
      role: 'user',
      content:
        'Gere a query para exportar todos os candidatos que atendem aos critérios da busca.',
    });

    this.logger.log('Gerando query para exportação CSV');

    const response = await this.openai.chat.completions.create({
      model,
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI não retornou uma resposta válida');
    }

    let parsed: { sql: string };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(
          `Não foi possível parsear resposta da OpenAI: ${content}`,
        );
      }
    }

    if (!parsed.sql) {
      throw new Error('A resposta não contém uma query SQL');
    }

    this.logger.log(`Executando query de exportação: ${parsed.sql}`);

    const data = await this.clickhouseService.query<any>(parsed.sql);

    // Gera CSV
    if (data.length === 0) {
      return 'Nenhum candidato encontrado';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(';'),
      ...data.map((row) =>
        headers
          .map((h) => {
            const value = row[h];
            if (value === null || value === undefined) return '';
            const strValue = String(value).replace(/"/g, '""');
            return strValue.includes(';') ||
              strValue.includes('"') ||
              strValue.includes('\n')
              ? `"${strValue}"`
              : strValue;
          })
          .join(';'),
      ),
    ];

    this.logger.log(`Exportando ${data.length} candidatos para CSV`);

    return csvRows.join('\n');
  }

  async exportToClickUp(
    clickUpListId: string,
    jobTitle: string,
    conversationHistory: MessageDto[],
    profileFeedback: ProfileFeedbackDto[],
    clickUpService: any,
  ): Promise<{
    success: boolean;
    clickUpTaskId?: string;
    clickUpTaskUrl?: string;
    candidatesCount: number;
    error?: string;
  }> {
    try {
      // Busca todos os candidatos baseado na conversa
      const schemaContext = await this.getSchemaContext();
      const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';

      // Monta contexto de feedback
      let feedbackContext = '';
      if (profileFeedback.length > 0) {
        const interesting = profileFeedback.filter((f) => f.interesting);
        const notInteresting = profileFeedback.filter((f) => !f.interesting);

        feedbackContext = `\n\nFeedback do recrutador sobre perfis:\n`;
        if (interesting.length > 0) {
          feedbackContext += `- Perfis INTERESSANTES: ${interesting.map((f) => `${f.profileName}${f.reason ? ` (${f.reason})` : ''}`).join(', ')}\n`;
        }
        if (notInteresting.length > 0) {
          feedbackContext += `- Perfis NÃO INTERESSANTES: ${notInteresting.map((f) => `${f.profileName}${f.reason ? ` (${f.reason})` : ''}`).join(', ')}\n`;
        }
      }

      const systemPrompt = `${schemaContext}${feedbackContext}

Você é um assistente de RECRUTAMENTO. Com base no histórico da conversa, gere uma query SQL ClickHouse para exportar TODOS os candidatos que atendem aos critérios (LIMITADO A 2000 resultados).

Responda APENAS em formato JSON válido:
{
  "sql": "SELECT profile_id, full_name, headline, current_job_title, current_company, seniority, area, city, state, profile_url FROM linkedin.people WHERE ... LIMIT 2000"
}

Regras:
- Inclua: profile_id, full_name, headline, current_job_title, current_company, seniority, area, city, state, profile_url
- LIMITE A 2000 RESULTADOS (LIMIT 2000)
- NÃO exclua perfis não interessantes do resultado - queremos todos que atendem ao filtro
- Baseie-se nos critérios da conversa

Não inclua texto antes ou depois do JSON.`;

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }

      messages.push({
        role: 'user',
        content:
          'Gere a query para exportar TODOS os candidatos que atendem aos critérios da busca.',
      });

      this.logger.log('Gerando query para exportação ao ClickUp');

      const response = await this.openai.chat.completions.create({
        model,
        messages,
      });

      const content = response.choices[0]?.message?.content?.trim();

      if (!content) {
        throw new Error('OpenAI não retornou uma resposta válida');
      }

      let parsed: { sql: string };
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(
            `Não foi possível parsear resposta da OpenAI: ${content}`,
          );
        }
      }

      if (!parsed.sql) {
        throw new Error('A resposta não contém uma query SQL');
      }

      this.logger.log(`Executando query de exportação: ${parsed.sql}`);

      const data = await this.clickhouseService.query<any>(parsed.sql);

      if (data.length === 0) {
        return {
          success: false,
          candidatesCount: 0,
          error: 'Nenhum candidato encontrado para os critérios da busca',
        };
      }

      this.logger.log(
        `Encontrados ${data.length} candidatos para exportar ao ClickUp`,
      );

      // Monta os candidatos no formato esperado pelo ClickUp
      const feedbackMap = new Map(profileFeedback.map((f) => [f.profileId, f]));

      const candidates = data.map((row: any) => {
        const fb = feedbackMap.get(row.profile_id);
        return {
          name: row.full_name || '',
          profileUrl: row.profile_url || '',
          headline: row.headline || row.current_job_title || '',
          currentCompany: row.current_company,
          feedback: fb
            ? fb.interesting
              ? ('interesting' as const)
              : ('not_interesting' as const)
            : undefined,
          reason: fb?.reason,
        };
      });

      // Cria a task com CSV no ClickUp
      const result = await clickUpService.createCandidatesTaskWithCsv(
        clickUpListId,
        candidates,
        jobTitle,
      );

      return {
        success: true,
        clickUpTaskId: result.task.id,
        clickUpTaskUrl: result.task.url,
        candidatesCount: candidates.length,
      };
    } catch (error) {
      this.logger.error(`Erro ao exportar para ClickUp: ${error}`);
      return {
        success: false,
        candidatesCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
