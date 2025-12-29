# Code Standards

## TypeScript Standards
- Use strict TypeScript configuration
- Prefer interfaces over type aliases
- Implement strong typing
- Use ESLint and Prettier for code formatting

## Project Structure
- `src/` directory contains application logic
- Modular architecture with clear separation of concerns
- Use dependency injection in NestJS
- Organize React components by feature

## Configuration Management
- Use `.env` files for environment-specific configuration
- Never commit sensitive credentials
- Provide `.env.example` as configuration templates

## Docker Standards
- Use multi-stage builds
- Minimize image size
- Use explicit version tags
- Separate Dockerfiles for backend and frontend

## Commit Guidelines
- Use meaningful, descriptive commit messages
- Link commits to specific tasks or issues
- Keep commits small and focused

## Testing Principles
- Aim for high test coverage
- Write unit and integration tests
- Use Jest for testing in both backend and frontend

## Performance Considerations
- Implement lazy loading in frontend
- Use efficient TypeScript compilation
- Optimize Docker build processes

## Security Practices
- Use environment variable injection
- Implement input validation
- Follow OWASP security guidelines
- Regular dependency updates