# ReviewBot Backend Codebase Summary: Azure OpenAI Integration

## Overview
ReviewBot is a GitLab code review automation system powered by Azure OpenAI, designed to provide intelligent, context-aware code reviews.

## Architectural Components

### Core Services
1. **WebhooksService**
   - Process GitLab merge request events
   - Upsert project and developer records
   - Queue reviews for async processing

2. **LLMService (Azure OpenAI)**
   - Token-efficient code review generation
   - Context-aware diff analysis
   - Structured review output
   - Graceful degradation when disabled

3. **DiffProcessor**
   - Extract changed lines with context
   - Language detection
   - Optimize review context

4. **QueueProcessor (Bull Queue)**
   - Asynchronous review job management
   - Distributed processing via Redis
   - Retry and error handling

## Key Features

### AI-Powered Code Review
- Analyze only changed lines
- Prioritize security, logic, and performance issues
- Generate structured JSON review results
- Inline comments for critical/high issues

### GitLab Integration
- Webhook authentication
- Merge request event processing
- Inline and summary comment posting
- 50 file review limit

### Architecture Design
- Microservices with NestJS
- Prisma ORM for database interactions
- Throttling and rate limiting
- Global exception handling
- Comprehensive input validation

## Performance Optimizations
- Asynchronous job processing
- Token-efficient AI interactions
- Configurable context lines
- Error retry mechanisms
- Graceful service degradation

## Code Quality Metrics
- Total Files: 22
- Total Tokens: 10,259
- Top 5 Token-Heavy Files:
  1. review-processor.ts (1,951 tokens)
  2. llm.service.ts (1,270 tokens)
  3. diff-processor.ts (1,038 tokens)
  4. webhooks.service.ts (797 tokens)
  5. gitlab.service.ts (730 tokens)

## Security Considerations
- OWASP Top 10 mitigation
- Constant-time token comparison
- Strict input validation
- Secure AI service interactions
- Configurable CORS
- Rate limiting

## Unresolved Questions
- Long-term AI model selection strategy
- Advanced review heuristics
- Multi-language support complexity
- Comprehensive performance metrics implementation

## Technology Stack
- Backend: NestJS (TypeScript)
- AI: Azure OpenAI
- Database: PostgreSQL (Prisma)
- Queue: Bull Queue (Redis)
- Validation: class-validator
- Deployment: Docker