import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * Authentication Service
 * Handles admin login with credentials from environment variables
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminUsername: string;
  private readonly adminPasswordHash: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.adminUsername = this.configService.get<string>('ADMIN_USERNAME') || 'admin';
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD') || 'change_me';

    // Hash password on startup for constant-time comparison
    this.adminPasswordHash = bcrypt.hashSync(adminPassword, 10);
    this.logger.log('✓ Auth service initialized');
  }

  /**
   * Admin login with username and password
   * @param username Admin username from environment
   * @param password Admin password from environment
   * @returns JWT token and user info
   */
  async login(username: string, password: string) {
    // Validate username (constant-time comparison would be ideal but username is not sensitive)
    if (username !== this.adminUsername) {
      this.logger.warn(`Failed login attempt for username: ${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate password with constant-time comparison via bcrypt
    const isValid = await bcrypt.compare(password, this.adminPasswordHash);
    if (!isValid) {
      this.logger.warn(`Failed login attempt - invalid password for: ${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { username, role: 'admin', sub: 'admin-user' };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`✓ Admin login successful: ${username}`);

    return {
      accessToken,
      user: {
        username,
        role: 'admin',
      },
    };
  }

  /**
   * Validate JWT token payload
   * @param payload Decoded JWT payload
   * @returns User object
   */
  async validateToken(payload: any) {
    return {
      username: payload.username,
      role: payload.role,
      userId: payload.sub,
    };
  }
}
