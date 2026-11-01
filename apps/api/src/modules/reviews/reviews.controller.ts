import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ReviewRequestSettingsDto } from '@oraviq/shared';
import { csv } from '../inbox/inbox.controller';
import { ReviewRequestsService } from './review-requests.service';
import { ReviewsService } from './reviews.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly requests: ReviewRequestsService,
  ) {}

  @Get('reviews')
  list(@Query('replied') replied?: string, @Query('source') source?: string, @Query('rating') rating?: string) {
    return this.reviews.list({ replied, source: csv(source), rating: csv(rating) });
  }

  @Post('reviews/:id/draft')
  @HttpCode(200)
  draft(@Param('id', uuid) id: string) {
    return this.reviews.draft(id);
  }

  @Post('reviews/:id/reply')
  @HttpCode(200)
  reply(@Param('id', uuid) id: string, @Body() body: { text: string }) {
    return this.reviews.reply(id, body?.text);
  }

  @Get('review-requests')
  async requestsList() {
    const s = await this.requests.settings();
    return { settings: this.requests.toSettingsDto(s), jobs: await this.requests.jobs() };
  }

  @Put('review-requests')
  updateRequests(@Body() body: Partial<ReviewRequestSettingsDto>) {
    return this.requests.updateSettings(body ?? {});
  }

  @Post('review-requests/:orderId/send')
  @HttpCode(200)
  send(@Param('orderId', uuid) orderId: string) {
    return this.requests.send(orderId);
  }
}
