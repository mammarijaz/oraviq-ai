import { Module } from '@nestjs/common';
import { LiveChatService } from './livechat.service';

@Module({
  providers: [LiveChatService],
  exports: [LiveChatService],
})
export class LiveChatModule {}
