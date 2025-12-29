# ReviewBot - AI-Powered GitLab Code Review System

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Azure OpenAI](https://img.shields.io/badge/Azure%20OpenAI-0078D4?logo=microsoft-azure&logoColor=white)](https://azure.microsoft.com/en-us/products/ai-services/openai-service)

Automated code review bot for GitLab using Azure OpenAI Haiku 4.5. Provides intelligent code analysis, security checks, performance suggestions, and inline comments directly on merge requests.

## 📸 Screenshots

### Dashboard
![Dashboard Overview](./images/dashboard.png)
*Real-time metrics showing code quality scores, issue breakdown, and review history*

### GitLab Integration
![Inline Comments](./images/inline-comments.jpeg)
*AI-powered inline comments directly on merge request code changes*

![MR Summary](./images/mr-summary.jpeg)
*Comprehensive merge request summary with quality score and categorized issues*

### Developer Analytics
![Developer Metrics](./images/developer-metrics.png)
*Track individual developer performance and improvement trends over time*

> **Note**: Add your screenshots to the `/images` folder to display them here.

## 🌟 Features

### Code Review Intelligence
- **AI-Powered Analysis**: Utilizes Azure OpenAI Haiku 4.5 for fast, accurate code reviews
- **Multi-Language Support**: Analyzes TypeScript, JavaScript, Python, Java, Go, Rust, PHP, and more
- **Smart Batching**: Combines multiple file changes into single LLM call for efficiency (≤500 lines)
- **False Positive Filtering**: Verifies LLM findings against actual file content to reduce noise

### Review Capabilities
- **Inline Comments**: Posts comments directly on specific code lines for critical/high/medium issues
- **Comprehensive Summary**: Detailed MR-level summary with quality scores and issue breakdown
- **Issue Categorization**:
  - **Severity**: Critical, High, Medium, Low
  - **Type**: Security, Performance, Logic, Style
- **Context-Aware**: Includes ±10 lines of context and imports for accurate analysis

### Developer Metrics
- **Quality Scoring**: 0-100 score based on issue severity
- **Historical Tracking**: Review history and trends per developer
- **Project Analytics**: Aggregate metrics across projects

### Integration
- **GitLab Webhooks**: Automatic review on MR open/update
- **Queue Processing**: Async job processing with Bull + Redis
- **API Access**: RESTful API for frontend consumption

## 🏗️ Architecture

```
reviewbot/
├── reviewbot-backend/     # NestJS API + Queue Processor
│   ├── src/
│   │   ├── webhook/       # GitLab webhook receiver
│   │   ├── llm/           # Azure OpenAI integration
│   │   ├── queue/         # Bull queue processing
│   │   ├── gitlab/        # GitLab API client
│   │   └── prisma/        # Database models
│   ├── prisma/            # Database schema
│   └── docker-compose.yml # Infrastructure stack
│
└── reviewbot-frontend/    # React + Vite Dashboard
    └── src/
        ├── pages/         # Dashboard, Projects, Developers, Reviews
        ├── components/    # Reusable UI components
        └── api/           # API client

```

### Tech Stack

**Backend**:
- NestJS (Node.js framework)
- Prisma ORM
- PostgreSQL (database)
- Redis + Bull (queue processing)
- Azure OpenAI API (Haiku 4.5)
- GitLab REST API (@gitbeaker/rest)

**Frontend**:
- React 19
- Vite (build tool)
- TanStack Query (data fetching)
- Tailwind CSS + shadcn/ui
- Recharts (visualization)

## 📋 Prerequisites

- **Node.js**: v18+ (backend and frontend)
- **Docker & Docker Compose**: For PostgreSQL and Redis
- **Azure OpenAI**: API key and Haiku 4.5 deployment
- **GitLab**: Personal access token with API scope
- **Git**: For version control

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd reviewbot
```

### 2. Backend Setup

```bash
cd reviewbot-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

**Required Environment Variables**:
```env
# Database
DATABASE_URL=postgresql://reviewbot:your_password@localhost:5432/reviewbot
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Azure OpenAI
AZURE_OPENAI_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_OPENAI_DEPLOYMENT=haiku-4-5
AZURE_OPENAI_MODEL_NAME=haiku-4-5

# GitLab
GITLAB_HOST=https://gitlab.com
GITLAB_WEBHOOK_SECRET=your_webhook_secret
GITLAB_ACCESS_TOKEN=your_gitlab_token

# Auth
JWT_SECRET=your_jwt_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run database migrations
npm run prisma:generate
npm run prisma:migrate
```

### 4. Start Backend

```bash
# Development mode with hot-reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

Backend runs on `http://localhost:3000`

### 5. Frontend Setup

```bash
cd ../reviewbot-frontend

# Install dependencies
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:3000" > .env.local

# Start development server
npm run dev
```

Frontend runs on `http://localhost:5173`

## ⚙️ Configuration

### GitLab Webhook Setup

1. Go to your GitLab project → **Settings** → **Webhooks**
2. Add webhook:
   - **URL**: `http://your-server:3000/webhook`
   - **Secret Token**: Use value from `GITLAB_WEBHOOK_SECRET`
   - **Trigger**: ✅ Merge request events
   - **SSL verification**: Enable if using HTTPS
3. Click **Add webhook**
4. Test by creating a test MR

### Azure OpenAI Setup

1. Create Azure OpenAI resource in Azure Portal
2. Deploy **Haiku 4.5** model (or your preferred model)
3. Get **API key** and **endpoint** from Keys and Endpoint section
4. Update `.env` with credentials

## 📊 Usage

### Dashboard

Access the frontend at `http://localhost:5173` to view:

- **Code Quality Metrics**: Issues found, review scores, trends
- **Project Management**: Configure webhooks, view project stats
- **Developer Performance**: Individual metrics, improvement trends
- **Review History**: Full review details with inline comments

### API Endpoints

**Webhook** (GitLab calls this):
- `POST /webhook` - Receive MR events

**Projects**:
- `GET /projects` - List all projects
- `POST /projects` - Add project
- `GET /projects/:id/reviews` - Project review history

**Reviews**:
- `GET /reviews` - List all reviews
- `GET /reviews/:id` - Review details

**Developers**:
- `GET /developers` - List all developers
- `GET /developers/:id/stats` - Developer metrics

### Review Workflow

1. **Developer creates/updates MR** → GitLab webhook fires
2. **Backend receives webhook** → Creates review job in queue
3. **Queue processor**:
   - Fetches MR diffs from GitLab
   - Collects file context (imports, surrounding lines)
   - Decides batching strategy (≤500 lines = batch)
   - Calls Azure OpenAI for review
   - Verifies issues to filter false positives
   - Posts inline comments (critical/high/medium)
   - Posts summary comment with all issues
4. **Frontend displays**:
   - Summary comment appears on MR
   - Inline comments appear on specific lines
   - Dashboard shows updated metrics

## 🔧 Development

### Project Structure

```
reviewbot-backend/src/
├── main.ts                # Application entry point
├── webhook/
│   ├── webhook.controller.ts    # Webhook endpoint
│   └── webhook.service.ts       # Webhook validation
├── llm/
│   ├── llm.service.ts           # Azure OpenAI integration
│   ├── diff-processor.ts        # Diff parsing
│   └── issue-verifier.service.ts # False positive filter
├── queue/
│   └── review-processor.ts      # Bull queue job handler
├── gitlab/
│   └── gitlab.service.ts        # GitLab API client
└── prisma/
    └── prisma.service.ts        # Database client
```

### Database Schema

```prisma
model Project {
  id              String   @id @default(cuid())
  gitlabProjectId Int      @unique
  name            String
  webhookUrl      String?
  reviews         Review[]
}

model Developer {
  id           String   @id @default(cuid())
  gitlabUserId Int      @unique
  username     String
  email        String?
  reviews      Review[]
}

model Review {
  id              String       @id @default(cuid())
  mergeRequestIid Int
  projectId       String
  developerId     String
  reviewContent   Json
  qualityScore    Int
  issuesFound     Int
  status          ReviewStatus
  createdAt       DateTime     @default(now())
  project         Project      @relation(...)
  developer       Developer    @relation(...)
}
```

### Running Tests

```bash
# Backend tests
cd reviewbot-backend
npm test

# Frontend tests
cd reviewbot-frontend
npm run test
```

### Building for Production

```bash
# Backend
cd reviewbot-backend
npm run build

# Frontend
cd reviewbot-frontend
npm run build
```

## 🐳 Docker Deployment

### Option 1: Docker Compose (Full Stack)

```bash
cd reviewbot-backend

# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Services:
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **Backend**: `localhost:3000`
- **Frontend**: `localhost:5173`

### Option 2: Separate Services

```bash
# Start only infrastructure
docker-compose up -d postgres redis

# Run backend locally
npm run start:dev

# Run frontend locally
cd ../reviewbot-frontend
npm run dev
```

## 🔍 Monitoring & Debugging

### Logs

```bash
# Backend logs (development)
npm run start:dev

# Docker logs
docker-compose logs -f backend

# Redis queue monitoring
npm run prisma:studio
# Navigate to Review model to see job status
```

### Common Issues

**Inline comments not posting**:
- Verify `GITLAB_ACCESS_TOKEN` has `api` scope
- Check `baseSha`, `headSha`, `startSha` are valid
- Ensure line number is within changed lines in diff

**Queue jobs stuck**:
- Check Redis connection: `redis-cli ping`
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
- Check Bull queue in Prisma Studio

**LLM timeout**:
- Verify Azure OpenAI credentials
- Check deployment name matches `AZURE_OPENAI_DEPLOYMENT`
- Increase timeout in `llm.service.ts` if needed

## 🛠️ Advanced Configuration

### Batching Threshold

Edit `reviewbot-backend/src/queue/review-processor.ts`:

```typescript
// Line 139: Change threshold for batching
const shouldBatch = totalChangedLines <= 500 && allChunksWithContext.length > 1;
//                                       ^^^
//                                       Adjust this value
```

### Context Lines

Edit `reviewbot-backend/src/queue/review-processor.ts`:

```typescript
// Line 95: Adjust context lines before/after changes
const chunks = this.diffProcessor.extractChangedLinesWithContext(
  diff.diff,
  10, // Change this value (default: 10)
);
```

### File Limit

Edit `reviewbot-backend/src/queue/review-processor.ts`:

```typescript
// Line 19: Maximum files per review
private readonly MAX_FILES = 50; // Adjust to prevent token overflow
```

## 📝 API Documentation

### Swagger/OpenAPI

Access interactive API documentation at:
```
http://localhost:3000/api/docs
```

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- **Azure OpenAI**: Haiku 4.5 model for fast code analysis
- **GitLab**: Webhook integration and API
- **NestJS**: Robust backend framework
- **Prisma**: Type-safe database ORM
- **shadcn/ui**: Beautiful UI components

## 📧 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing documentation in `/docs`
- Review `/plans` for project roadmap

---

**Made with ❤️ for better code quality**
