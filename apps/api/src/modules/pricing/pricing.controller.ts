import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UpdatePriceTableRequest } from '@oraviq/shared';
import { Roles } from '../../common/decorators';
import { PricingService } from './pricing.service';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  get() {
    return this.pricing.getDto();
  }

  @Put()
  @Roles('owner', 'admin')
  update(@Body() body: UpdatePriceTableRequest) {
    return this.pricing.update(body ?? ({} as UpdatePriceTableRequest));
  }
}
