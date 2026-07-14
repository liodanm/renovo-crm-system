# Importing This Project Into GitHub

Written for the same zero-assumed-experience level as
`docs/DEPLOYMENT_GUIDE.md`. This is the very first step — do this before
anything in that guide.

## 1. Create a GitHub account (skip if you already have one)

Go to github.com → Sign up. Free tier is all you need.

## 2. Create a new, empty repository

github.com → click the **+** icon (top right) → **New repository**.

- **Repository name**: something like `renovo-crm` (lowercase, hyphens
  instead of spaces — GitHub will let you use other characters, but this
  is the convention).
- **Visibility**: choose **Private**. This project contains your real
  business logic and, once you configure it, references to your real
  integration accounts — there's no reason for it to be public.
- **Do not** check "Add a README" or "Add .gitignore" — this project
  already has both, and letting GitHub create its own would conflict with
  the ones already here.
- Click **Create repository**. GitHub shows you a page with setup
  commands — keep that page open, you'll use it in step 4.

## 3. Install Git on your computer (if you don't have it)

Check first — open a terminal and run `git --version`. If it prints a
version number, skip to step 4. If not, install Git from git-scm.com
(Windows/Mac/Linux installers all there) and re-check.

## 4. Push this project to your new repository

Open a terminal in the project folder (the one containing `backend/`,
`frontend/`, `docker-compose.yml`, etc.) and run:

```bash
git init
git add .
git commit -m "Initial import"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/renovo-crm.git
git push -u origin main
```

Replace `YOUR-USERNAME/renovo-crm` with the actual path GitHub showed you
in step 2.

**Before you run `git add .`**, it's worth running `git status` first and
glancing at the list of files it's about to stage — confirm you don't see
`backend/.env` in that list (you shouldn't; `.gitignore` already excludes
it). This is the single most consequential check in this whole guide —
catching a leaked secret before it's pushed costs you thirty seconds;
catching it after means rotating every credential that was in that file.

## 5. Verify it actually worked

Refresh the repository page on GitHub — you should see the full project
structure (`backend/`, `frontend/`, `docs/`, etc.). Click into
`backend/.env.example` on GitHub's file browser and confirm it shows
empty/placeholder values, not real secrets — a second, independent check
of the same thing step 4 already asked you to verify once.

## What happens next

From here, `docs/DEPLOYMENT_GUIDE.md` picks up at "Part 2: Prepare for
production," which starts by having Railway connect directly to this
GitHub repository — that connection is what makes `git push` to `main`
become "deploy a new version" once it's set up.

## If you need to make changes later

Standard Git workflow, same as any other project from here:

```bash
git add .
git commit -m "Describe what changed"
git push
```

If you connected Railway to auto-deploy from `main` (covered in the
deployment guide), pushing is all it takes to ship a change.
