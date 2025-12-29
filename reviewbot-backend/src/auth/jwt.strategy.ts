import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/**
 * JWT Strategy
 * Validates JWT tokens from Authorization header
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-change-me',
    });
  }

  /**
   * Validate JWT payload and return user object
   * This method is called automatically by Passport after token verification
   * @param payload Decoded JWT payload
   * @returns User object attached to request
   */
  async validate(payload: any) {
    return {
      username: payload.username,
      role: payload.role,
      userId: payload.sub,
    };
  }
}
