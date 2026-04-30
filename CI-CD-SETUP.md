# CI/CD Pipeline Setup Guide

## Overview

This guide explains the automated CI/CD pipeline for Step Zero, including linting, validation, and deployment to Render.

## 🚀 Quick Start (3 Steps)

### Step 1: Get Render Deploy Hook

1. Open https://dashboard.render.com/
2. Select **Step Zero** service
3. Navigate to **Settings** tab
4. Scroll to **Deploy** section
5. Click **Create Deploy Hook**
6. Copy the webhook URL (starts with `https://api.render.com/...`)

### Step 2: Add to GitHub Secrets

1. Go to your repository: https://github.com/deepaksharma0801/Step-Zero
2. Click **Settings** (top right)
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Name: `RENDER_DEPLOY_HOOK`
6. Paste the webhook URL from Step 1
7. Click **Add secret** ✅

### Step 3: Test It

Merge a PR or push to `main`:
```bash
git checkout main
git pull
git push origin main
```

Watch GitHub Actions run:
- https://github.com/deepaksharma0801/Step-Zero/actions

---

## 📊 Workflows Explained

### 1. **CI/CD Pipeline** (`.github/workflows/ci.yml`)

**Triggers:** Every push/PR to `main` or `develop`

**What it does:**
- ✅ Installs dependencies
- ✅ Runs `npm run check` (eslint + syntax validation)
- ✅ Validates `package.json`
- ✅ Deploys to Render (if push to `main` and all checks pass)

**Status:** Check [Actions tab](https://github.com/deepaksharma0801/Step-Zero/actions)

### 2. **Health Check** (`.github/workflows/health-check.yml`)

**Triggers:** Every 6 hours automatically (or manually)

**What it does:**
- 🏥 Pings `/api/health` endpoint
- 📝 Creates a GitHub issue if API is down
- 🏷️ Tags issue as `bug` and `deployment`

**Manual trigger:**
```bash
# Go to Actions → API Health Check → Run workflow
```

### 3. **Dependency Updates** (`.github/workflows/dependency-updates.yml`)

**Triggers:** Every Monday at midnight

**What it does:**
- 📦 Checks for npm package updates
- 📋 Creates issue if updates available

---

## 🔧 Customization

### Change Deployment Branch

Edit `.github/workflows/ci.yml`:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Change `main` to `production` or any other branch.

### Change Health Check Schedule

Edit `.github/workflows/health-check.yml`:

```yaml
schedule:
  - cron: '0 */6 * * *'  # Change this
```

**Cron format examples:**
- `'0 * * * *'` = Every hour
- `'0 0 * * *'` = Every day at midnight
- `'0 0 * * 0'` = Every Sunday at midnight
- `'*/30 * * * *'` = Every 30 minutes

### Change Health Check URL

Edit `.github/workflows/health-check.yml`:

```yaml
HEALTH_URL="https://step-zero.onrender.com/api/health"
```

Change to your production URL.

---

## 📝 Environment Variables for Render

Make sure these are set in Render dashboard:

```env
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash-lite
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=60000
PORT=3000
NODE_ENV=production
```

---

## ❌ Troubleshooting

### Deployment Not Triggering

**Check:**
1. Is `RENDER_DEPLOY_HOOK` secret set? 
   - Go to Settings → Secrets and variables → Actions
   - Should see `RENDER_DEPLOY_HOOK` listed
2. Did you push to `main`?
3. Did linting pass?

**View logs:**
- https://github.com/deepaksharma0801/Step-Zero/actions
- Click latest workflow run
- Click "Deploy to Render" job

### Linting Failures

Fix locally and commit:

```bash
npm run lint    # Auto-fix issues
npm run check   # Verify all pass
git add .
git commit -m "fix: resolve linting issues"
git push origin your-branch
```

### Health Check Creating False Alerts

Render free tier may spin down after 15 minutes of inactivity. This is normal:
- First request after sleep may be slow (30-60 seconds)
- Check if Render service shows "Spinning up..."
- Can upgrade to paid plan to prevent this

---

## 🎯 Next Steps

1. ✅ Complete Quick Start (3 steps above)
2. 🧪 Add unit tests (`npm test`)
3. 📊 Monitor health checks
4. 🔐 Rotate API keys regularly

---

## 📚 Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Render Deployment Hooks](https://render.com/docs/deploy-hooks)
- [Cron Schedule Syntax](https://crontab.guru/)
- [Node.js with GitHub Actions](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs)

---

## 💡 Tips

- **Test locally first:** Run `npm run check` before pushing
- **Check logs:** Always review workflow logs for failures
- **Use branch protection:** Require passing checks before merge
- **Monitor costs:** Free Render tier has limits; watch usage
- **Keep secrets safe:** Never commit `.env` file
