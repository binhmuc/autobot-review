# Database Setup Guide

## Prerequisites
- Docker and Docker Compose installed
- DATABASE_URL configured in `.env` file

> **Note:** This project uses Prisma 7.2.0 which requires `DATABASE_URL` in `prisma.config.ts` instead of directly in `schema.prisma`. The configuration is automatically generated when you run `npx prisma init`.

## Database Schema

The ReviewBot uses PostgreSQL with the following tables:

### Tables
1. **projects** - GitLab projects being monitored
2. **developers** - GitLab users/developers
3. **reviews** - Code review records
4. **code_changes** - Diff details for each review
5. **project_metrics** - Aggregated stats per project
6. **developer_metrics** - Aggregated stats per developer

### Enums
- **ReviewStatus**: PENDING, PROCESSING, COMPLETED, FAILED, SKIPPED

## Quick Start

### 1. Start Database
```bash
# From reviewbot-backend directory
docker-compose up postgres -d
```

### 2. Run Migrations
```bash
npm run prisma:migrate
```

This will:
- Create all database tables
- Set up indexes for performance
- Generate Prisma Client types

### 3. Seed Sample Data (Optional)
```bash
npm run prisma:seed
```

Creates:
- Sample project "Sample Project"
- Sample developer "test_developer"

## Available Commands

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create and apply migrations
npm run prisma:migrate

# Seed database with test data
npm run prisma:seed

# Open Prisma Studio (GUI)
npm run prisma:studio
```

## Schema Changes

After modifying `prisma/schema.prisma`:

1. Generate new client: `npm run prisma:generate`
2. Create migration: `npm run prisma:migrate`
3. Migration name will be prompted

## Verification

Check tables created:
```bash
docker exec -it reviewbot-postgres psql -U reviewbot -d reviewbot -c "\dt"
```

Check indexes:
```bash
docker exec -it reviewbot-postgres psql -U reviewbot -d reviewbot -c "\di"
```

## Troubleshooting

### Connection Errors
- Verify PostgreSQL container running: `docker ps`
- Check DATABASE_URL in `.env`
- Test connection: `npx prisma db pull`

### Migration Errors
- Reset database: `npx prisma migrate reset` (WARNING: destroys all data)
- Check logs: `docker logs reviewbot-postgres`

## Production Notes

- Never commit `.env` file
- Use strong passwords
- Enable SSL connections
- Set up automated backups
- Monitor connection pool usage
- Review slow queries regularly
