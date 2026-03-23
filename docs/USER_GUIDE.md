# Translation Helper - User Guide

This guide covers how translators and deployers work with the Translation Helper application.

---

## Table of Contents

- [Overview](#overview)
- [Onboarding](#onboarding)
  - [Setting Up a New Language](#setting-up-a-new-language)
  - [Setting Up a New Project](#setting-up-a-new-project)
  - [Onboarding a Translator](#onboarding-a-translator)
  - [Onboarding a Deployer](#onboarding-a-deployer)
- [Translator Workflow](#translator-workflow)
  - [Dashboard Overview](#dashboard-overview)
  - [Starting a Translation](#starting-a-translation)
  - [Using the Translation Editor](#using-the-translation-editor)
  - [Saving and Submitting](#saving-and-submitting)
  - [Handling Review Feedback](#handling-review-feedback)
- [Reviewer Workflow](#reviewer-workflow)
  - [Reviewing a Translation](#reviewing-a-translation)
  - [Adding Suggestions](#adding-suggestions)
  - [Approving or Requesting Changes](#approving-or-requesting-changes)
- [Deployer Workflow](#deployer-workflow)
  - [Deploying Translations](#deploying-translations)
  - [Managing Languages](#managing-languages)
  - [Managing Projects](#managing-projects)
  - [Managing Users](#managing-users)
- [Document Lifecycle](#document-lifecycle)
- [Roles and Permissions](#roles-and-permissions)
- [Support & Bug Reporting](#support--bug-reporting)

---

## Overview

Translation Helper is a web application for managing the translation workflow of Markdown documents. It supports:

- Side-by-side translation with the source (English) document
- A review and approval pipeline before deployment
- GitHub integration for automated deployment
- Project-based organization with team assignments

There are two global roles:

| Role           | Description                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| **Translator** | Can create, translate, and review documents                                           |
| **Deployer**   | All translator permissions + admin features (deploy, manage languages/projects/users) |

---

## Onboarding

### Setting Up a New Language

> Requires the **Deployer** role.

1. Navigate to **Admin > Languages** (`/admin/languages`)
2. Click **Add Language**
3. Fill in the form:
   - **Language code** - lowercase ISO code, e.g. `cs`, `de`, `fr`, `es`
   - **Language name** - display name, e.g. `Czech`, `German`, `French`
   - **Branch name** (optional) - Git branch for GitHub deployment, e.g. `czech-translation`
   - **Translation instructions** (optional) - Markdown guidelines that translators will see on their dashboard (terminology, tone, formatting rules, etc.)
4. Click **Save**

Once created, the language is available across the application. Existing source projects will automatically get a new Translation Project for this language.

#### Writing Translation Instructions

Translation instructions support Markdown and should cover:

- Preferred terminology and glossary
- Tone and formality level
- Formatting conventions (e.g. how to handle Bible verse references)
- Common pitfalls or false friends
- Links to external style guides

Translators can view these instructions from **Settings > Language Instructions**.

---

### Setting Up a New Project

> Requires the **Deployer** role.

A project groups related documents (e.g. "Exodus90 - 2026", "Advent 2025").

1. Navigate to **Admin > Projects** (`/admin/projects`)
2. Click **Create Project**
3. Fill in:
   - **Name** - descriptive project name
   - **Description** (optional) - context for the team
   - **Identifier** (optional) - used for GitHub file path resolution
   - **Status** - `Active` or `Complete`
4. Click **Save**

The system automatically creates a **Translation Project** for each existing language. These translation projects are where you assign team members.

#### Assigning Team Members

1. Open the Translation Project (e.g. "Exodus90 - 2026 - Czech")
2. Click **Add Member**
3. Select a user and assign a project role:

| Project Role        | Capabilities                                       |
| ------------------- | -------------------------------------------------- |
| **Project Manager** | Assign documents, manage team, review translations |
| **Reviewer**        | Review and approve translations, request changes   |
| **Editor**          | Translate and edit translations, review            |
| **Translator**      | Translate documents                                |

#### Assigning Documents

1. Open the Translation Project
2. Navigate to the document list
3. Click **Assign** on a document
4. Optionally select a specific translator (leave empty for team-visible)
5. Optionally set a deadline
6. Click **Save**

---

### Onboarding a Translator

#### Step 1: Account Creation

A deployer creates your account or you register at the login page. Your default role is **Translator**.

#### Step 2: First Login & Language Selection

On your first login, you will be redirected to the **Language Selection** page (`/onboarding/languages`).

1. Select the language(s) you translate into
2. Click **Continue**

Your dashboard will only show documents for your selected languages. You can change this later in **Settings**.

#### Step 3: Get Familiar with the Dashboard

Your dashboard (`/dashboard`) shows:

- **My Assignments** - documents assigned to you, with status and deadlines
- **My Translations** - documents you are actively translating
- **Needs Review** - documents waiting for your review (if you are a reviewer)

#### Step 4: Read Translation Instructions

Go to **Settings > Language Instructions** to read any guidelines set by the team for your language.

---

### Onboarding a Deployer

A deployer has all translator capabilities plus admin access.

#### Admin Panel

Navigate to **Admin** (`/admin`) to access:

- **Languages** - add/edit languages, set translation instructions and branch names
- **Projects** - create source projects, manage translation projects and assignments
- **Users** - view users, change roles (Translator/Deployer)

#### GitHub Integration (Optional)

If your team uses GitHub for content deployment, configure the following environment variables:

```
GITHUB_APP_ID=xxxxx
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...
GITHUB_INSTALLATION_ID=xxxxx
GITHUB_REPO_OWNER=username
GITHUB_REPO_NAME=repo-name
```

Each language needs a **branch name** configured in the language settings.

#### Deployer-Specific Dashboard

Your dashboard additionally shows:

- **Ready to Deploy** - approved translations waiting for deployment

---

## Translator Workflow

### Dashboard Overview

After logging in, the dashboard is your home base. It displays:

1. **My Assignments** - documents assigned to you by a project manager
2. **My Translations** - documents where you have an in-progress translation
3. **Needs Review** - documents submitted by others that need your review

Each card shows the document title, current status, language, and deadline (if set).

### Starting a Translation

1. Find a document in **My Assignments** or from the **Documents** page (`/documents`)
2. Click the document or the status badge for your language
3. You will land on the **Translation page** (`/documents/[id]/translate`)

If no translation exists yet, you will be prompted to start one. The document status will move from `Pending Translation` to `In Progress`.

### Using the Translation Editor

The translation interface has two panels:

| Left Panel (Source)                                        | Right Panel (Translation)                        |
| ---------------------------------------------------------- | ------------------------------------------------ |
| English source document                                    | Your translation                                 |
| Read-only                                                  | Editable                                         |
| Toggle: **Raw** (code) / **Formatted** (rendered Markdown) | Toggle: **Edit** (code) / **Preview** (rendered) |

**Tips:**

- Use **Raw** view on the source to see exact Markdown formatting (frontmatter, headings, links)
- Copy the source structure into your translation, then translate the text
- Preserve Markdown syntax: `**bold**`, `*italic*`, `> blockquotes`, `# headings`
- Keep frontmatter keys in English, only translate their values
- Press **F11** for Zen mode (full-screen editor, fewer distractions)

### Saving and Submitting

| Action                | What It Does                            | Status After     |
| --------------------- | --------------------------------------- | ---------------- |
| **Save Draft**        | Saves your work, you can continue later | `In Progress`    |
| **Submit for Review** | Sends the translation for review        | `Pending Review` |

Drafts are auto-saved every 5 seconds while you type.

After submitting for review, you cannot edit the translation until a reviewer either approves it or requests changes.

### Handling Review Feedback

If a reviewer requests changes:

1. Your document moves back to `In Progress`
2. Check the **Comments** section for reviewer feedback
3. Check **Suggestions** for inline change proposals:
   - **Comment suggestions** - feedback on specific lines, no proposed change
   - **Change suggestions** - include a proposed replacement text; you can **Apply** (accept) or **Dismiss** (reject with reason)
4. Make your edits
5. **Submit for Review** again

---

## Reviewer Workflow

### Reviewing a Translation

1. Find documents to review in the **Needs Review** section of your dashboard
2. Click to open the **Review page** (`/documents/[id]/review`)
3. The review interface shows the source and translation side by side

### Adding Suggestions

While reviewing, you can add inline feedback:

- **Comment** - general feedback on a section or line
- **Change** - propose a specific text replacement

Suggestions appear in the **Suggestions Panel** and are visible to the translator.

Each suggestion can have a thread of replies for discussion.

### Requesting Final Approval

When a document is in `Pending Review` status, you can flag it as ready for a final sign-off before approval:

1. Open the review page for a document in **Pending Review**
2. Click **Request final approval**
3. The button changes to **Waiting for final approval** (green) to indicate the label is active
4. Click again to remove the label (toggle)

This adds a "Waiting for final label" to the document, which is visible on the **Kanban Board** for easy tracking. Use this when the translation looks good overall but you want a second pair of eyes before fully approving.

### Approving or Requesting Changes

| Action              | What It Does                           | Status After  |
| ------------------- | -------------------------------------- | ------------- |
| **Approve**         | Translation is ready for deployment    | `Approved`    |
| **Request Changes** | Sends back to translator with feedback | `In Progress` |

When requesting changes, always leave comments or suggestions explaining what needs to be fixed.

---

## Deployer Workflow

### Deploying Translations

1. Open the **Ready to Deploy** section on your dashboard, or filter documents by `Approved` status
2. Click **View & Deploy** to open the review page
3. Review the final translation
4. Click **Deploy**

What happens on deploy:

- The document status changes to `Deployed`
- If GitHub integration is configured:
  - A commit is created on the language's configured branch
  - A pull request is created or updated
  - The commit SHA, branch, and PR URL are recorded
- The translated file becomes available for download

### Managing Languages

**Admin > Languages** (`/admin/languages`)

- **Add** new languages (code, name, branch, instructions)
- **Edit** existing languages (update name, branch name, translation instructions)
- **Delete** languages (removes the language and its translation projects)

### Managing Projects

**Admin > Projects** (`/admin/projects`)

- **Create** new source projects
- **Edit** project details and status (Active/Complete)
- **Manage** translation projects (one per language per source project)
- **Assign** team members and documents to translation projects

### Managing Users

**Admin > Users** (`/admin/users`)

- View all registered users
- Change a user's global role between **Translator** and **Deployer**

---

## Document Lifecycle

The complete lifecycle of a document from creation to deployment:

```
┌──────────────────────────────────────────────────────────┐
│                    DOCUMENT CREATED                      │
│  Upload .md file or create in editor                     │
│  Assigned to a Source Project                            │
│  Fill all necessary information about document           │
│  English (source) version auto-created as APPROVED       │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│              PENDING TRANSLATION (gray)                  │
│  Document is available for translation                   │
│  Project manager may assign it to a translator           │
└──────────────────┬───────────────────────────────────────┘
                   │ Translator starts
                   ▼
┌──────────────────────────────────────────────────────────┐
│                 IN PROGRESS (blue)                       │
│  Translator is working on the translation                │
│  Can save drafts, auto-saves every 5 seconds             │
└──────────┬───────────────────────────────┬───────────────┘
           │ Submit for review             │ (can also revert
           ▼                               │  to Pending)
┌──────────────────────────────────────────────────────────┐
│               IN REVIEW (yellow)                         │
│  Waiting for a reviewer to check the translation         │
│  Translator cannot edit at this stage                    │
└──────────┬───────────────────────────────┬───────────────┘
           │ Approve                       │ Request changes
           ▼                               ▼
┌─────────────────────────┐    ┌───────────────────────────┐
│    APPROVED (green)     │    │   Back to IN PROGRESS     │
│    Ready for deploy     │    │   Translator fixes issues │
└──────────┬──────────────┘    └───────────────────────────┘
           │ Deploy
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  DEPLOYED (purple)                                       │
│  Translation is in Exodus repository, waiting for adding/added into app  │
│  GitHub commit/PR created (if configured)                                │
│  File available for download (if needed)                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Roles and Permissions

### Global Roles

Both translators and deployers can create, translate, review, and approve documents. The key difference is that only deployers can deploy and access admin features.

| Permission                    | Translator | Deployer |
| ----------------------------- | :--------: | :------: |
| Create documents              |    Yes     |   Yes    |
| Translate documents           |    Yes     |   Yes    |
| Review & approve translations |    Yes     |   Yes    |
| Add comments & suggestions    |    Yes     |   Yes    |
| Deploy translations           |     No     |   Yes    |
| Manage languages              |     No     |   Yes    |
| Manage projects               |     No     |   Yes    |
| Manage users                  |     No     |   Yes    |

### Project Roles

Within each Translation Project, members can be assigned roles. These roles primarily control **document assignment** and **project management** capabilities. Note that review and approval permissions are currently open to all users at the global level.

_Note: This is still in progress and it will be changed. We will move from "language" permissions to project permissions._

| Project Role        | Primary Purpose                                                            |
| ------------------- | -------------------------------------------------------------------------- |
| **Project Manager** | Assign documents to team members, manage project membership, set deadlines |
| **Reviewer**        | Designated reviewer for assigned translations                              |
| **Editor**          | Edit translations directly                                                 |
| **Translator**      | Translate assigned documents                                               |

---

## Support & Bug Reporting

Two floating buttons are available in the bottom-right corner of every page:

| Button           | Icon      | Purpose                                                                                        |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------- |
| **Support**      | Life buoy | Opens the general support portal for questions, help requests, and feature suggestions         |
| **Report a bug** | Bug       | Opens a pre-filled bug report form that automatically includes the URL of the page you were on |

Both links open the Jira Service Desk in a new tab. Use **Report a bug** when something is broken or behaving unexpectedly, and **Support** for general questions or requests.
