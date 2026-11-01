import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current organization details' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getCurrent(@Request() req: any) {
    return this.organizationsService.findOne(req.user.organizationId);
  }

  @Patch('current')
  @ApiOperation({ summary: 'Update current organization settings' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async updateCurrent(@Request() req: any, @Body() dto: UpdateOrgDto) {
    return this.organizationsService.update(req.user.organizationId, dto);
  }

  @Get('current/business-hours')
  @ApiOperation({ summary: 'Get business hours for the current organization' })
  @ApiResponse({ status: 200, description: 'Business hours configuration' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getBusinessHours(@Request() req: any) {
    return this.organizationsService.getBusinessHours(req.user.organizationId);
  }

  @Put('current/business-hours')
  @ApiOperation({ summary: 'Update business hours for the current organization' })
  @ApiResponse({ status: 200, description: 'Business hours updated' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async updateBusinessHours(
    @Request() req: any,
    @Body() dto: UpdateBusinessHoursDto,
  ) {
    return this.organizationsService.updateBusinessHours(
      req.user.organizationId,
      dto,
    );
  }
}
