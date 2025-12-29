# ReviewBot Quick Start

## Prerequisites
- Node.js 20+
- PostgreSQL database access
- Azure OpenAI API key
- GitLab account

## 1. Backend Setup

```bash
cd reviewbot-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials:
# - DATABASE_URL (PostgreSQL connection string)
# - AZURE_OPENAI_KEY & AZURE_OPENAI_ENDPOINT
# - GITLAB_ACCESS_TOKEN
# - JWT_SECRET

# Generate Prisma client
npx prisma generate

# Sync database schema (if not already done)
npx prisma db push

# Start dev server
npm run start:dev
```

Backend should start on http://localhost:3000

## 2. Frontend Setup

```bash
cd reviewbot-frontend

# Install dependencies
npm install

# Configure environment
echo "VITE_API_URL=http://localhost:3000" > .env

# Start dev server
npm run dev
```

Frontend should start on http://localhost:5173

## 3. Test the System

### Login
- Navigate to http://localhost:5173/login
- Use admin credentials from backend `.env`:
  - Username: `admin` (or value from `ADMIN_USERNAME`)
  - Password: value from `ADMIN_PASSWORD`

### Configure GitLab Webhook
1. Go to your GitLab project → Settings → Webhooks
2. Add webhook URL: `http://your-backend-url/webhooks/gitlab`
3. Set secret token (from `GITLAB_WEBHOOK_SECRET` in `.env`)
4. Enable "Merge request events"

## 4. Docker Deployment (Optional)

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Troubleshooting

### Backend won't start
- Check DATABASE_URL is correct
- Ensure PostgreSQL is running
- Run `npx prisma db push` to sync schema

### Frontend shows blank page
- Check `.env` file exists with `VITE_API_URL`
- Verify backend is running on port 3000
- Check browser console for errors

### Authentication fails
- Verify `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` in backend `.env`
- Check backend logs for auth errors

## Project Structure

```
reviewbot/
├── reviewbot-backend/     # NestJS API
│   ├── src/
│   │   ├── auth/         # JWT authentication
│   │   ├── webhooks/     # GitLab webhook handler
│   │   ├── queue/        # Bull queue for async reviews
│   │   ├── llm/          # Azure OpenAI integration
│   │   ├── reviews/      # Review CRUD & stats
│   │   ├── projects/     # Project management
│   │   └── developers/   # Developer metrics
│   └── prisma/           # Database schema
└── reviewbot-frontend/    # React UI
    └── src/
        ├── pages/        # Dashboard, Projects, Reviews, Developers
        ├── contexts/     # Auth context
        └── components/   # Reusable UI components
```

## Next Steps
- Add your first GitLab project
- Create a test merge request to trigger webhook
- View AI code review results in dashboard
- Check developer performance metrics
