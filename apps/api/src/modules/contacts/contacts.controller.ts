import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts (paginated, searchable, filterable)' })
  @ApiOkResponse({ description: 'Paginated list of contacts' })
  findAll(@CurrentOrg() orgId: string, @Query() query: ContactQueryDto) {
    return this.contactsService.findAll(orgId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contact with conversation count' })
  @ApiOkResponse({ description: 'Contact details' })
  findOne(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactsService.findOne(orgId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiCreatedResponse({ description: 'Contact created' })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentOrg() orgId: string, @Body() dto: CreateContactDto) {
    return this.contactsService.create(orgId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contact' })
  @ApiOkResponse({ description: 'Contact updated' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact' })
  @ApiNoContentResponse({ description: 'Contact deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactsService.remove(orgId, id);
  }

  @Post(':id/merge')
  @ApiOperation({ summary: 'Merge secondary contact into primary' })
  @ApiOkResponse({ description: 'Contacts merged; returns updated primary contact' })
  merge(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) primaryId: string,
    @Body('secondaryId', ParseUUIDPipe) secondaryId: string,
  ) {
    return this.contactsService.merge(orgId, primaryId, secondaryId);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add a tag to a contact' })
  @ApiOkResponse({ description: 'Tag added; returns updated contact' })
  addTag(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.contactsService.addTag(orgId, id, tagId);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Remove a tag from a contact' })
  @ApiNoContentResponse({ description: 'Tag removed' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTag(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.contactsService.removeTag(orgId, id, tagId);
  }
}
