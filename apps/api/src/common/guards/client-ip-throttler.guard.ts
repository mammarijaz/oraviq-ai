import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { env } from '../../config/env';

/**
 * Rate limits per client IP. Behind Cloudflare (TRUST_CLOUDFLARE=true) the real client is in CF-Connecting-IP;
 * only trust it when every request really comes through Cloudflare, or anyone could pick their own IP.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    if (env().TRUST_CLOUDFLARE) {
      const cf = req.headers?.['cf-connecting-ip'];
      if (typeof cf === 'string' && cf.trim()) return cf.trim();
    }
    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
