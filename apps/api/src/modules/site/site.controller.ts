import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SiteSettingsDto, WidgetSettingsDto } from '@oraviq/shared';
import { Roles } from '../../common/decorators';
import { SiteService } from './site.service';

@ApiTags('website')
@ApiBearerAuth()
@Controller()
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get('site')
  get() {
    return this.site.getSite();
  }

  @Put('site')
  @Roles('owner', 'admin')
  update(@Body() body: Partial<SiteSettingsDto>) {
    return this.site.updateSite(body ?? {});
  }

  @Post('site/publish')
  @Roles('owner', 'admin')
  @HttpCode(200)
  publish() {
    return this.site.publish();
  }

  @Post('site/domain')
  @Roles('owner', 'admin')
  @HttpCode(200)
  domain(@Body() body: { domain: string }) {
    return this.site.connectDomain(body?.domain);
  }

  @Get('widgets')
  widgets() {
    return this.site.getWidgets();
  }

  @Put('widgets')
  @Roles('owner', 'admin')
  updateWidgets(@Body() body: Partial<WidgetSettingsDto>) {
    return this.site.updateWidgets(body ?? {});
  }
}
