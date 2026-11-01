import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ORDER_STATUSES, type CreateOrderRequest, type OrderStatus, type QuoteRequest, type RescheduleOrderRequest } from '@oraviq/shared';
import { BadRequestException } from '@nestjs/common';
import { InboxQueries } from '../inbox/inbox.queries';
import { csv } from '../inbox/inbox.controller';
import { QuotesService } from '../quotes/quotes.service';
import { OrdersService } from './orders.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly queries: InboxQueries,
    private readonly quotes: QuotesService,
  ) {}

  @Post('quotes')
  @HttpCode(200)
  quote(@Body() body: QuoteRequest & { conversationId?: string }) {
    if (!body || body.yards == null || !body.zip || !body.debris) throw new BadRequestException('yards, zip and debris are required.');
    return this.quotes.preview(body);
  }

  @Get('orders')
  list(@Query('q') q?: string, @Query('status') status?: string, @Query('channel') channel?: string, @Query('sort') sort?: string) {
    return this.queries.listOrders({ q, status: csv(status), channel: csv(channel), sort });
  }

  @Get('orders/:id')
  get(@Param('id', uuid) id: string) {
    return this.queries.orderDto(id);
  }

  @Post('orders')
  create(@Body() body: CreateOrderRequest) {
    return this.orders.create(body ?? ({} as CreateOrderRequest));
  }

  @Post('orders/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', uuid) id: string) {
    return this.orders.confirm(id);
  }

  @Post('orders/:id/deposit-link')
  @HttpCode(200)
  depositLink(@Param('id', uuid) id: string) {
    return this.orders.sendDepositLink(id);
  }

  @Post('orders/:id/reschedule')
  @HttpCode(200)
  reschedule(@Param('id', uuid) id: string, @Body() body: RescheduleOrderRequest) {
    if (!body?.deliveryDate) throw new BadRequestException('Pick a delivery date.');
    return this.orders.reschedule(id, { ...body, notifyCustomer: body.notifyCustomer !== false });
  }

  @Post('orders/:id/status')
  @HttpCode(200)
  status(@Param('id', uuid) id: string, @Body() body: { status: OrderStatus }) {
    if (!ORDER_STATUSES.includes(body?.status)) throw new BadRequestException(`status must be one of ${ORDER_STATUSES.join(', ')}.`);
    return this.orders.setStatus(id, body.status);
  }
}
