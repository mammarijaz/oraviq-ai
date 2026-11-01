import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * LocalStrategy delegates credential validation to AuthService.validateUser.
 * If passport-local is installed in the future, this can be extended with
 * PassportStrategy(Strategy) from passport-local.
 */
@Injectable()
export class LocalStrategy {
  constructor(private readonly authService: AuthService) {}

  async validate(email: string, password: string): Promise<any> {
    return this.authService.validateUser(email, password);
  }
}
