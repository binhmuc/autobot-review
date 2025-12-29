# System Architecture

## High-Level Architecture

### Repository Structure
- `reviewbot-backend/`: NestJS TypeScript backend
  - Containerized via Docker
  - TypeScript configuration
  - Environment-based configuration

- `reviewbot-frontend/`: React frontend
  - Containerized via Docker
  - Served through Nginx
  - Environment-based configuration

### Infrastructure Components
- Backend Framework: NestJS
- Frontend Framework: React
- Containerization: Docker
- Web Server: Nginx
- Configuration Management: `.env` files

## Deployment Strategy
- Docker Compose for local development
- Separate Dockerfiles for backend and frontend
- Nginx used as reverse proxy for frontend

## Environment Configuration
- `.env.example` files provide template for configuration
- Sensitive credentials must be replaced in actual deployments
- Supports multiple environment modes (development, staging, production)

### Security Considerations
- Placeholder credentials in `.env.example`
- `.gitignore` configured to prevent sensitive data commits
- Environment-specific configuration management