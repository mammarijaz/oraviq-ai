import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private parseRange(q: AnalyticsQueryDto) {
    return { from: new Date(q.from), to: new Date(q.to) };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard stats' })
  getDashboard(@CurrentOrg() orgId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboard(orgId, this.parseRange(query));
  }

  @Get('messages')
  @ApiOperation({ summary: 'Messages by day' })
  getMessagesByDay(
    @CurrentOrg() orgId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getMessagesByDay(orgId, this.parseRange(query));
  }

  @Get('channels')
  @ApiOperation({ summary: 'Conversations by channel' })
  getConversationsByChannel(
    @CurrentOrg() orgId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getConversationsByChannel(
      orgId,
      this.parseRange(query),
    );
  }

  @Get('agents')
  @ApiOperation({ summary: 'Agent performance' })
  getAgentPerformance(
    @CurrentOrg() orgId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getAgentPerformance(
      orgId,
      this.parseRange(query),
    );
  }

  @Get('ai')
  @ApiOperation({ summary: 'AI-handled conversation stats' })
  getAiStats(@CurrentOrg() orgId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getAiStats(orgId, this.parseRange(query));
  }
}
