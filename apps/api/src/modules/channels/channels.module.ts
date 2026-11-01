import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { InstagramModule } from './instagram/instagram.module';
import { SmsModule } from './sms/sms.module';
import { LiveChatModule } from './livechat/livechat.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [WhatsAppModule, InstagramModule, SmsModule, LiveChatModule, VoiceModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [
    ChannelsService,
    WhatsAppModule,
    InstagramModule,
    SmsModule,
    LiveChatModule,
    VoiceModule,
  ],
})
export class ChannelsModule {}
