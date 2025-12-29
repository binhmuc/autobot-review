import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'ReviewBot Backend API - Ready to review your code!';
  }
}
