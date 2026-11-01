import { Module } from '@nestjs/common';
import { SocketModule } from '../socket/socket.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [SocketModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
