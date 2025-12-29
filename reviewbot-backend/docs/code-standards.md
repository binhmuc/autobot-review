# Code Standards: GitLab Code Review Bot

## Backend Development Standards (NestJS)

### Project Structure
```
src/
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
├── webhooks/
│   ├── dto/
│   ├── controllers/
│   └── services/
├── modules/
└── main.ts
```

### Coding Conventions
- Use TypeScript strict mode
- Implement dependency injection
- Follow SOLID principles
- Use decorators for metadata
- Prefer composition over inheritance

### Security Practices
- Always validate and sanitize input
- Use environment-specific configurations
- Implement constant-time comparisons
- Apply rate limiting
- Use parameterized queries
- Validate and limit request sizes

### Error Handling
- Create standardized error responses
- Use global exception filters
- Log errors with sufficient context
- Avoid exposing sensitive information

### Performance Guidelines
- Use async/await for I/O operations
- Implement connection pooling
- Use database transactions
- Minimize database queries
- Cache frequently accessed data

### Testing Standards
- 70% unit test coverage
- Integration tests for critical paths
- Mock external dependencies
- Test error scenarios
- Use Jest and Supertest

### Example Standards
```typescript
// Good: Clear, focused DTO
export class ReviewRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  projectName: string;

  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: string;
}

// Good: Guard implementation
@Injectable()
export class GitlabWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return this.validateWebhookToken(request);
  }
}
```

### Dependency Management
- Use npm for package management
- Keep dependencies updated
- Audit packages regularly
- Use exact versions in package.json

### Continuous Improvement
- Regular code reviews
- Refactor legacy code
- Stay updated with NestJS best practices
- Monitor performance metrics