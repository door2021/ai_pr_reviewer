# DeepReview — AI Code Reviewer for GitHub PRs

> Review your pull requests with AI. Get a safety score, issue breakdown, and merge recommendation in seconds.

<img width="1509" height="783" alt="dashboard" src="https://github.com/user-attachments/assets/58f77835-de24-4f4b-8c3b-1fcc787b2162" />


---

## What it does

DeepReview connects to your GitHub repositories and runs an AI review on any pull request. It flags bugs, security issues, and bad patterns — then gives you a safety score so you know if the PR is ready to merge.

Everything happens from a single dashboard. No tab switching, no GitHub back-and-forth.

**Core features:**
- AI review with safety score (0–100) and issue breakdown
- Approve, comment, and merge PRs directly from the dashboard
- AI-generated PR descriptions from your diff
- Multi-account GitHub support (PAT or GitHub App)
- Manual review mode — you control when AI runs
- Review history persists across sessions

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Zustand |
| Backend | FastAPI, SQLAlchemy, MySQL, Redis |
| AI (primary) | Groq — llama-3.3-70b-versatile (free tier) |
| AI (fallback) | OpenRouter — llama-3.3-70b-instruct (free tier) |
| Auth | JWT, bcrypt |
| Hosting | Vercel (frontend) + Railway (backend) |

---

## Screenshots

| Login | Dashboard | AI Review |
|-------|-----------|-----------|
<img width="1509" height="783" alt="login" src="https://github.com/user-attachments/assets/cc4e2b51-5160-4a79-947b-2de478ef2f10" />
<img width="1509" height="783" alt="dashboard" src="https://github.com/user-attachments/assets/a255cb48-8a89-4d7b-a78e-98ad962f7dcd" />
<img width="1509" height="783" alt="review" src="https://github.com/user-attachments/assets/d5fe5a53-25f8-482a-915f-a12a5453edaf" />

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- MySQL running locally
- Redis running locally (or skip — app degrades gracefully)

### Backend setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Copy env template and fill in values
cp .env.example .env

# Edit .env — minimum required:
# DATABASE_URL=mysql+pymysql://root:@localhost:3306/deepreview
# SECRET_KEY=any-random-32-char-string
# GROQ_API_KEY=your-groq-key (free at console.groq.com)

# Create database
mysql -u root -p -e "CREATE DATABASE deepreview;"

# Start backend (tables auto-created on first run)
uvicorn app.main:app --reload --port 8000
```

Backend runs at: `http://localhost:8000`
API docs at: `http://localhost:8000/docs`

### Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Create env file
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env

# Start dev server
npm run dev
```

Frontend runs at: `http://localhost:5173`

### Database migrations

```bash
# Run from backend/ directory with venv active

# Add Stripe columns (if not already applied)
mysql -u root -p deepreview < migrate_stripe.sql

# Add GitHub App installation column
mysql -u root -p deepreview < migrate_github_app.sql
```

---

## Environment Variables

### Backend (`.env`)

```env
# Core
APP_NAME=DeepReview
DEBUG=true
DATABASE_URL=mysql+pymysql://root:@localhost:3306/deepreview
REDIS_URL=redis://localhost:6379
SECRET_KEY=generate-with-python-secrets-token-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# AI — get free keys, no credit card needed
OPENROUTER_API_KEY=sk-or-...        # openrouter.ai
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
GROQ_API_KEY=gsk_...                # console.groq.com
GROQ_MODEL=llama-3.3-70b-versatile

# GitHub App (optional for local dev)
GITHUB_APP_NAME=deepreviewai
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=

# Frontend URL
FRONTEND_URL=http://localhost:5173

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend (`.env`)

```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Production Deployment

### Backend → Railway

1. Push repo to GitHub
2. Railway → New Project → Deploy from GitHub repo
3. Set **Root Directory** to `backend`
4. Add MySQL and Redis services
5. Set environment variables in Railway dashboard
6. Set **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### Frontend → Vercel

1. Vercel → New Project → Import GitHub repo
2. Set **Root Directory** to `frontend`
3. Add environment variable: `VITE_API_URL=https://your-backend.up.railway.app/api/v1`
4. Deploy

### Production environment variables

```env
# Railway backend — key differences from local:
DEBUG=false
DATABASE_URL=mysql+pymysql://user:pass@host:port/railway
REDIS_URL=redis://default:pass@host:port
FRONTEND_URL=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
```

---

## GitHub App Setup (optional)

The app works with Personal Access Tokens (PAT) out of the box. GitHub App install gives users a 2-click install experience without needing a PAT.

See [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) for full setup instructions.

---

## Project Structure

```
ai_pr_review/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, router registration
│   │   ├── config.py            # Settings from env vars
│   │   ├── database.py          # SQLAlchemy engine
│   │   ├── models.py            # DB models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── auth.py              # Auth service
│   │   ├── dependencies.py      # JWT dependency
│   │   ├── ai_engine.py         # Groq + OpenRouter AI
│   │   ├── github_client.py     # GitHub REST API client
│   │   ├── github_app.py        # GitHub App JWT auth
│   │   ├── routers/
│   │   │   ├── auth.py          # Signup, login, logout
│   │   │   ├── users.py         # Profile, settings, password
│   │   │   ├── github.py        # Repos, PRs, sync, approve, merge
│   │   │   ├── reviews.py       # AI review creation and retrieval
│   │   │   ├── github_app_router.py  # GitHub App install flow
│   │   │   └── billing.py       # Stripe (disabled by default)
│   │   └── utils/
│   │       └── security.py      # bcrypt, JWT utils
│   ├── requirements.txt
│   ├── railway.toml
│   ├── migrate_stripe.sql
│   └── migrate_github_app.sql
└── frontend/
    ├── public/
    │   └── logo.png
    ├── src/
    │   ├── pages/
    │   │   ├── auth/            # Login, Signup, ForgotPassword
    │   │   ├── Dashboard.tsx    # Main PR review dashboard
    │   │   ├── Setting.tsx      # Review mode, profile, security
    │   │   └── Billing.tsx      # Stripe pricing page
    │   ├── components/
    │   │   ├── Sidebar.tsx      # Accounts, repos, PR tree
    │   │   └── GitHubModal.tsx  # Connect GitHub account modal
    │   ├── store/
    │   │   └── useStore.ts      # Zustand global state
    │   └── lib/
    │       └── api.ts           # Axios API client
    ├── index.html
    └── vercel.json
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | Create account |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| GET | `/api/v1/users/me` | Get current user |
| PUT | `/api/v1/users/me/settings` | Update review mode |
| PUT | `/api/v1/users/me/password` | Change password |
| POST | `/api/v1/github-import/connect-account` | Connect GitHub via PAT |
| GET | `/api/v1/github-import/repos` | List imported repos |
| POST | `/api/v1/github-import/import-repos` | Import repos |
| GET | `/api/v1/github-import/repos/{id}/pulls` | Get PRs for repo |
| POST | `/api/v1/github-import/prs/{id}/approve` | Approve PR on GitHub |
| POST | `/api/v1/github-import/prs/{id}/merge` | Merge PR on GitHub |
| POST | `/api/v1/github-import/prs/{id}/comment` | Post comment to GitHub |
| POST | `/api/v1/reviews/` | Start AI review |
| GET | `/api/v1/reviews/{id}/status` | Poll review status |
| POST | `/api/v1/reviews/generate-description` | Generate PR description |
| GET | `/api/v1/github-app/install` | Start GitHub App install |
| GET | `/api/v1/github-app/callback` | GitHub App OAuth callback |
| GET | `` | Health check |

---

## Common Issues

| Error | Fix |
|-------|-----|
| `No module named 'MySQLdb'` | Change `DATABASE_URL` prefix to `mysql+pymysql://` |
| `bcrypt has no attribute '__about__'` | Pin versions: `passlib==1.7.4` and `bcrypt==4.0.1` |
| CORS error in browser | Add your Vercel URL to `CORS_ORIGINS` in Railway |
| Tables don't exist | App auto-creates on startup via `Base.metadata.create_all()` |
| `$PORT` not a valid integer | Set start command to use `--port 8000` not `--port $PORT` |

---

## License

MIT
