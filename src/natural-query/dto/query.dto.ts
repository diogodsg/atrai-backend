import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ProfileFeedbackDto {
  @IsString()
  @IsNotEmpty()
  profileId: string;

  @IsString()
  @IsNotEmpty()
  profileName: string;

  @IsBoolean()
  interesting: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ConversationQueryDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  @IsOptional()
  conversationHistory?: MessageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileFeedbackDto)
  @IsOptional()
  profileFeedback?: ProfileFeedbackDto[];

  @IsBoolean()
  @IsOptional()
  executeQuery?: boolean = true;
}

export class NaturalQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsBoolean()
  @IsOptional()
  executeQuery?: boolean = true;
}

export class ExportCsvDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  @IsOptional()
  conversationHistory?: MessageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileFeedbackDto)
  @IsOptional()
  profileFeedback?: ProfileFeedbackDto[];
}

export class ExportToClickUpDto {
  @IsString()
  @IsNotEmpty()
  clickUpListId: string;

  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  @IsOptional()
  conversationHistory?: MessageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileFeedbackDto)
  @IsOptional()
  profileFeedback?: ProfileFeedbackDto[];
}
