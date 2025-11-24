# Translation Helper

A comprehensive translation management system built with Next.js, Prisma, and Better-auth.

## Features

- ✅ **Authentication**: Email/password authentication with role-based access control
- ✅ **Dashboard**: Language-based filtering with status tabs (Needs Translation, Needs Review, Ready to Deploy)
- ✅ **Document Management**: Create documents via drag & drop upload or in-app markdown editor
- ✅ **Translation Workflow**: Side-by-side editor with source and target language views
- ✅ **Review System**: Comments, approve/request changes functionality
- ✅ **Deploy Feature**: Download translated files with status tracking
- ✅ **Activity Logging**: Track all changes with user attribution
- ✅ **Admin Panel**: Manage languages and folders

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-auth
- **UI**: Shadcn/ui + Tailwind CSS
- **Markdown**: react-markdown with GitHub Flavored Markdown support

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start the Database

```bash
docker-compose up -d
```

### 3. Set Up Environment Variables

Create a `.env` file:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5511/translation_helper"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secret-key-here" # Generate a secure random string
```

### 4. Run Database Migrations

```bash
pnpm prisma db push
```

### 5. Seed the Database

```bash
pnpm db:seed
```

This will create initial languages (English, Czech, German, French, Spanish) and folders.

### 6. Start the Development Server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

## User Roles

### Translator (Default)

- Create and translate documents
- Submit translations for review
- Review and approve other translators' work
- Add comments to translations

### Deployer

- All Translator permissions
- Deploy approved translations
- Manage languages and folders
- Access admin panel

## Architecture

### Domain-Driven Design

The application follows a domain-driven architecture with clear separation of concerns:

```
src/
├── domain/              # Business logic
│   ├── user/
│   │   ├── user.types.ts       # TypeScript types & Zod schemas
│   │   ├── user.repository.ts  # Database queries
│   │   └── user.actions.ts     # Server actions
│   ├── document/
│   ├── document-version/
│   ├── language/
│   ├── folder/
│   ├── comment/
│   └── activity-log/
├── app/                 # Next.js pages (App Router)
│   ├── dashboard/
│   │   ├── page.tsx           # Server component
│   │   └── page.client.tsx    # Client component
│   ├── documents/
│   ├── admin/
│   └── login/
├── components/          # Reusable UI components
└── lib/                 # Utilities
    ├── auth.ts         # Better-auth configuration
    ├── db.ts           # Prisma client
    ├── session.ts      # Session helpers
    └── permissions.ts  # Role-based permissions
```

### Page Pattern

Each page follows a server/client split:

- **page.tsx**: Server Component that fetches data
- **page.client.tsx**: Client Component that handles interactivity

### Data Flow

- Server Components → Call repositories directly for reads
- Client Components → Call server actions for mutations
- No API routes except authentication and file downloads

## Workflow

### 1. Create a Document

1. Navigate to "New Document"
2. Either drag & drop a markdown file or create one in the editor
3. Set title, slug, folder, and labels
4. The document is created with an English (source) version

### 2. Translate

1. Dashboard shows documents needing translation in your selected language
2. Click "Start Translation"
3. View English source on the left, translate on the right
4. Toggle between Edit and Preview modes
5. Save draft or submit for review

### 3. Review

1. Dashboard shows documents pending review
2. Click "Review"
3. View side-by-side comparison
4. Add comments, edit if needed
5. Approve or request changes

### 4. Deploy (Deployers Only)

1. Dashboard shows approved documents (Ready to Deploy tab)
2. Click "View & Deploy"
3. Click "Deploy" to change status and download the file

## Database Schema

- **User**: Authentication and roles
- **Language**: Supported languages
- **Folder**: Document organization
- **Document**: Base document information
- **DocumentVersion**: Language-specific versions with status tracking
- **Comment**: Review comments
- **ActivityLog**: Audit trail for all actions

## Development

### Run Migrations

```bash
pnpm prisma migrate dev --name migration_name
```

### Generate Prisma Client

```bash
pnpm prisma generate
```

### View Database

```bash
pnpm prisma studio
```

## Production Deployment

1. Set environment variables in your hosting platform
2. Build the application:

```bash
pnpm build
```

3. Start the production server:

```bash
pnpm start
```

## License

MIT
