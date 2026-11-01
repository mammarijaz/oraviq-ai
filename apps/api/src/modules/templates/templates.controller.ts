import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@ApiTags('Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List canned responses (optionally filtered by category)' })
  @ApiQuery({ name: 'category', required: false })
  findAll(@CurrentOrg() orgId: string, @Query('category') category?: string) {
    return this.templatesService.findAll(orgId, category);
  }

  @Get('shortcut/:shortcut')
  @ApiOperation({ summary: 'Find template by shortcut string' })
  @ApiParam({ name: 'shortcut', description: 'Shortcut e.g. greeting (without slash)' })
  findByShortcut(
    @CurrentOrg() orgId: string,
    @Param('shortcut') shortcut: string,
  ) {
    return this.templatesService.findByShortcut(orgId, `/${shortcut}`);
  }

  @Post()
  @ApiOperation({ summary: 'Create a canned response' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(orgId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a canned response' })
  @ApiParam({ name: 'id' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a canned response' })
  @ApiParam({ name: 'id' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.remove(orgId, id);
  }
}
