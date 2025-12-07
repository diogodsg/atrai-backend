import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Helper para converter array para string
const arrayToString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value as string | undefined;
};

// Helper para garantir que valor seja array
const toArray = (value: unknown): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Se for string, tenta separar por vírgula ou retorna como array de um elemento
    return value.includes(',')
      ? value.split(',').map((s) => s.trim())
      : [value];
  }
  return undefined;
};

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  area: string;

  @IsString()
  @IsNotEmpty()
  seniority: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  openingReason?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  challenges?: string;

  @IsString()
  @IsOptional()
  reportsTo?: string;

  @IsString()
  @IsOptional()
  influenceOver?: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  responsibilities?: string[];

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  first3MonthsDeliverables?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  criticalRoutines?: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  technicalSkills?: string[];

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  behavioralSkills?: string[];

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  preferredExperience?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  metricsAndKPIs?: string;

  @IsString()
  @IsOptional()
  workFormat?: string;

  @IsString()
  @IsOptional()
  hybridDays?: string;

  @IsString()
  @IsOptional()
  salary?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => arrayToString(value))
  benefits?: string;

  @IsString()
  @IsOptional()
  contractType?: string;

  @IsString()
  @IsOptional()
  additionalNotes?: string;
}

export class JobConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class JobConversationDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @IsOptional()
  conversationHistory?: JobConversationMessageDto[];

  @IsOptional()
  currentJobData?: Partial<CreateJobDto>;
}

export class CandidateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  profileUrl: string;

  @IsString()
  @IsOptional()
  headline?: string;

  @IsString()
  @IsOptional()
  currentCompany?: string;

  @IsString()
  @IsOptional()
  feedback?: 'interesting' | 'not_interesting';

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ExportCandidatesToClickUpDto {
  @IsString()
  @IsNotEmpty()
  clickUpListId: string;

  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @IsArray()
  candidates: CandidateDto[];
}

export class ExportSearchToClickUpDto {
  @IsString()
  @IsNotEmpty()
  clickUpListId: string;

  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @IsArray()
  @IsOptional()
  conversationHistory?: JobConversationMessageDto[];

  @IsArray()
  @IsOptional()
  profileFeedback?: Array<{
    profileId: string;
    profileName: string;
    interesting: boolean;
    reason?: string;
  }>;
}
