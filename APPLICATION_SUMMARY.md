# Translation Helper - Application Summary

## Overview

Translation Helper is a comprehensive web-based translation management system designed for managing multi-language document translations with a structured workflow. It enables teams to create, translate, review, and deploy markdown documents across multiple languages with role-based access control and full audit trails.

## Core Purpose

The application manages the complete lifecycle of document translations:

1. **Document Creation**: Create source documents (English) via upload or in-app editor
2. **Translation**: Translate documents into target languages
3. **Review**: Review translations with comments and approval workflow
4. **Deployment**: Deploy approved translations and download files

## Key Features

### 1. Authentication & Authorization

- Email/password authentication using Better-auth
- Two user roles:
  - **Translator** (default): Can create, translate, review, and comment on documents
  - **Deployer**: All translator permissions + deploy translations, manage languages/folders, access admin panel

### 2. Dashboard

- **Status-based filtering** with tabs:
  - "Needs Translation" - Documents requiring translation in selected language
  - "Needs Review" - Translations pending review
  - "My Translations" - User's own translation work
  - "Ready to Deploy" - Approved translations (Deployers only)
- **Language selector**: Filter documents by target language
- **Folder filter**: Organize documents by folders
- **Search**: Search documents by title or slug
- **Document cards** showing:
  - Title, slug, folder, labels
  - Translation status badges
  - Last updated date and translator name
  - Action buttons (Start Translation, Review, Continue Draft, etc.)

### 3. Documents Overview Page

- **Matrix view**: Shows all documents with translation status across all languages
- **Visual status indicators**:
  - ⏰ Pending Review (yellow)
  - ⚠️ Pending Translation (blue)
  - ⭕ No Translation (gray)
  - ✅ Approved (green)
  - 🚀 Deployed (purple)
- Clickable status icons that navigate to translate/review pages
- Folder and search filtering

### 4. Document Creation

- **Two modes**:
  - **Upload**: Drag & drop or file picker for markdown files
  - **Create**: In-app markdown editor
- **Metadata**:
  - Title (auto-extracted from frontmatter or filename)
  - Slug (auto-generated from title)
  - Folder selection
  - Labels (tags for categorization)
  - Optional deadline
- **Frontmatter parsing**: Extracts metadata from markdown frontmatter (title, day, verse_tag, hero, subtitle)

### 5. Translation Interface

- **Side-by-side layout**:
  - **Left panel**: Source document (English)
  - **Right panel**: Translation editor
- **Source panel features**:
  - Toggle between "Raw" (code editor) and "Formatted" (markdown preview)
  - Line numbers
  - Read-only
- **Translation panel features**:
  - Toggle between "Edit" (code editor) and "Preview" (markdown preview)
  - Line number synchronization with source
  - Auto-save drafts
  - AI translation assistance (optional)
- **Zen mode**: Full-screen distraction-free editing (F11 to toggle)
- **Actions**:
  - Save Draft (status: PENDING_TRANSLATION)
  - Submit for Review (status: PENDING_REVIEW)
  - AI Translate (generates initial translation)

### 6. Review Interface

- **Side-by-side comparison**:
  - Source document (left)
  - Translation (right)
- **View modes**:
  - Formatted (markdown preview)
  - Raw (code editor, read-only by default)
- **Review actions**:
  - **Edit**: Can edit translation directly
  - **Add Comment**: Leave feedback for translator
  - **Request Final Approval**: Toggle "Waiting for final label" on documents in PENDING_REVIEW status; visible on Kanban board for workflow tracking
  - **Approve**: Mark as approved (status: APPROVED)
  - **Request Changes**: Revert to PENDING_TRANSLATION status
  - **Deploy** (Deployers only): Change status to DEPLOYED and download file
- **Comments system**: View and add comments on translations
- **Activity log**: Track all changes with user attribution

### 7. Admin Features (Deployers only)

- **Language Management**: Add/edit languages, set translation instructions per language
- **Folder Management**: Organize documents into folders
- **Language Instructions**: Configure translation guidelines per language

### 8. Settings

- **Language Instructions**: View and manage translation instructions for each language

## Technical Architecture

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-auth
- **UI Components**: Shadcn/ui + Tailwind CSS
- **Markdown**: react-markdown with GitHub Flavored Markdown
- **Code Editor**: Monaco Editor (@monaco-editor/react)
- **Icons**: Lucide React

### Architecture Pattern

- **Domain-Driven Design** with clear separation:
  - `domain/` - Business logic (types, repositories, actions)
  - `app/` - Next.js pages (server/client split)
  - `components/` - Reusable UI components
  - `lib/` - Utilities (auth, db, session, permissions)

### Data Model

- **User**: Authentication, roles
- **Language**: Supported languages with translation instructions
- **Folder**: Document organization
- **Document**: Base document (title, slug, labels, folder, deadline)
- **DocumentVersion**: Language-specific version with:
  - Content (markdown)
  - Status (PENDING_TRANSLATION, PENDING_REVIEW, APPROVED, DEPLOYED)
  - Version number
  - User (translator)
- **Comment**: Review comments on translations
- **ActivityLog**: Audit trail for all actions

### Status Workflow

```
PENDING_TRANSLATION → PENDING_REVIEW → APPROVED → DEPLOYED
                          ↓
                   (Request Changes)
```

## Current UI Components

### Main Components

1. **SourceTranslationViewer**: Core side-by-side viewer component

   - Supports "translate" and "review" variants
   - Line number synchronization
   - Raw/Formatted view toggles
   - Zen mode support
   - Edit/Preview modes

2. **RawEditorPane**: Code editor with line numbers

   - Monaco editor integration
   - Line highlighting
   - Cursor position tracking
   - Read-only mode

3. **Navigation**: Top navigation bar

   - Links to Dashboard, Documents, New Document
   - Admin links (for Deployers)
   - User info and logout

4. **UI Components** (Shadcn/ui):
   - Button, Card, Badge, Input, Textarea, Select, Tabs, Dialog, Label

### Page Structure

- **Server Components** (`page.tsx`): Fetch data, handle authentication
- **Client Components** (`page.client.tsx`): Handle interactivity, state management

## User Workflows

### Workflow 1: Create & Translate

1. User creates new document (upload or editor)
2. Document created with English source version
3. Translator selects language on dashboard
4. Clicks "Start Translation" on document
5. Side-by-side editor opens
6. Translates content, saves draft or submits for review

### Workflow 2: Review & Approve

1. Reviewer sees document in "Needs Review" tab
2. Opens review interface
3. Compares source and translation side-by-side
4. Adds comments or edits directly
5. Approves or requests changes
6. If approved, appears in "Ready to Deploy" (for Deployers)

### Workflow 3: Deploy

1. Deployer views "Ready to Deploy" tab
2. Opens document review page
3. Clicks "Deploy" button
4. Status changes to DEPLOYED
5. File downloads automatically

## Current UI Characteristics

### Design Style

- Clean, minimal interface
- Gray/white color scheme
- Card-based layouts
- Status badges with color coding
- Responsive design

### Key UI Patterns

- **Tabs**: Status filtering, view mode switching
- **Cards**: Document listings, content panels
- **Badges**: Status indicators, labels
- **Side-by-side**: Source/translation comparison
- **Modal dialogs**: Forms, confirmations
- **Search & filters**: Language, folder, text search

### Interaction Patterns

- Click-to-navigate (documents → translate/review)
- Tab switching (status, view modes)
- Toggle buttons (edit/preview, raw/formatted)
- Keyboard shortcuts (F11 for zen mode, Escape to exit)
- Drag & drop (file upload)

## Areas for UI Improvement

### Potential Enhancement Areas

1. **Visual Design**: Modernize color scheme, improve typography, add animations
2. **Information Architecture**: Better organization of navigation, filters, and actions
3. **User Experience**: Streamline workflows, reduce clicks, improve feedback
4. **Data Visualization**: Progress indicators, translation completion metrics, timeline views
5. **Collaboration**: Enhanced comment system, real-time updates, notifications
6. **Accessibility**: Keyboard navigation, screen reader support, color contrast
7. **Mobile Responsiveness**: Optimize for smaller screens
8. **Performance**: Loading states, optimistic updates, caching strategies

## Context for AI Model

This summary is intended to help AI models understand the application's purpose, features, and current state to generate creative and practical UI improvement suggestions. The application is functional but could benefit from modern UI/UX enhancements, better visual hierarchy, improved workflows, and enhanced user experience patterns.
