# ERP-EA (Taskea)

Enterprise task management, approvals, and team coordination system built with Next.js 16, Prisma, and PostgreSQL.

## Features

- Task management with multi-step workflows
- Leave & approval management
- Real-time notifications
- Employee dashboard with role-based access (FOUNDER, ADMIN, EMPLOYEE)
- HRMS bridge integration
- AI assistant for task queries
- Monday meeting tracker
- Weekly performance scores

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **UI**: Tailwind CSS, shadcn/ui
- **Auth**: Custom session-based

## Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start dev server
npm run dev
```

## Deployment

This app is deployed on Vercel (Hobby plan, free tier).

- **Production URL**: https://task.ea.laxree.com
- **Database**: Neon PostgreSQL (free tier)

## License

Proprietary - LAXREE Internal Use Only
