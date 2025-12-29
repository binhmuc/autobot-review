import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for updating an existing project
 * All fields are optional
 */
export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiProperty({
    example: true,
    description: 'Whether the project is active for code reviews',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
