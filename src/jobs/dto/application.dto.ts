import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUrl,
} from 'class-validator';

export class JobApplicationDto {
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUrl()
  @IsOptional()
  linkedinUrl?: string;

  @IsUrl()
  @IsOptional()
  portfolioUrl?: string;

  @IsString()
  @IsOptional()
  currentRole?: string;

  @IsString()
  @IsOptional()
  currentCompany?: string;

  @IsString()
  @IsOptional()
  yearsOfExperience?: string;

  @IsString()
  @IsOptional()
  salaryExpectation?: string;

  @IsString()
  @IsOptional()
  availableToStart?: string;

  @IsString()
  @IsOptional()
  whyInterested?: string;

  @IsString()
  @IsOptional()
  additionalInfo?: string;
}

export interface JobPublicInfo {
  id: string;
  title: string;
  area: string;
  seniority: string;
  workFormat?: string;
  salary?: string;
  benefits?: string;
  responsibilities?: string[];
  technicalSkills?: string[];
  behavioralSkills?: string[];
  preferredExperience?: string;
  companyName?: string;
}
