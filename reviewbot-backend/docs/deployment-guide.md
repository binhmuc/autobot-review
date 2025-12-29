# Deployment Guide: GitLab Code Review Bot with Azure OpenAI

## Prerequisites
- Docker
- Docker Compose
- GitLab API Access Token
- Azure OpenAI Credentials
- Redis
- Node.js 18+

## Configuration

### Environment Variables (.env)
```bash
# Azure OpenAI Configuration
AZURE_OPENAI_KEY=your_azure_openai_key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your_deployment_name

# GitLab Configuration
GITLAB_HOST=https://gitlab.com
GITLAB_ACCESS_TOKEN=your_gitlab_token

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Application Configuration
NODE_ENV=production
PORT=3000
```

## Deployment Options

### 1. Docker Compose (Recommended)
```bash
# Clone repository
git clone https://github.com/your-org/reviewbot-backend.git
cd reviewbot-backend

# Copy .env.example to .env and configure
cp .env.example .env
# Edit .env with your configurations

# Build and start services
docker-compose up --build -d
```

### 2. Manual Deployment
```bash
# Install dependencies
npm install

# Build application
npm run build

# Start with PM2 (recommended)
npm install -g pm2
pm2 start dist/main.js

# Redis setup separately
# Ensure Redis is running and configured
```

## Scaling Considerations
- Horizontal scaling via Docker Swarm/Kubernetes
- Adjust Bull Queue concurrency
- Monitor Redis connection pool

## Monitoring
- Prometheus metrics endpoint
- Logging via Winston
- Performance tracking

## Security Best Practices
- Rotate tokens regularly
- Use least-privilege IAM roles
- Enable network-level restrictions
- Implement IP whitelisting

## Troubleshooting
- Check Docker logs: `docker-compose logs`
- Verify Redis connectivity
- Validate Azure OpenAI credentials
- Review application logs

## Post-Deployment Verification
1. Test GitLab webhook integration
2. Verify Azure OpenAI review generation
3. Check comment posting functionality
4. Monitor system performance

## Uninstallation
```bash
# Stop and remove containers
docker-compose down --volumes

# Remove images (optional)
docker-compose rm
```

## Version Compatibility
- NestJS: 10.x
- Azure OpenAI SDK: Latest
- Node.js: 18.x LTS
- Redis: 6.x+

## Update Strategy
- Pull latest image
- Run database migrations
- Restart services
- Validate functionality