# SkillStat AI — Personalized Learning & Assessment Platform

SkillStat AI is a full-stack web application that turns any document you upload into a
personalized 5-question quiz. It combines your profile (role, department, qualification,
experience, interests, skill level) with the content of the document to generate questions
that are relevant to what you read *and* appropriate for your background.

This is the **first working version** of the platform: register → build a profile → upload a
document → get a personalized quiz → take it → see your score → track progress on a dashboard.

---

## 1. Features

- Secure signup/login with hashed passwords (bcrypt) and JWT-protected routes
- Editable learner profile with a live profile-completion indicator
- Document upload (PDF, DOCX, PPTX, TXT) with type/size/empty-file validation
- A separate Python AI microservice that:
  - Extracts text from the uploaded document
  - Detects the main topic
  - Generates exactly 5 personalized multiple-choice questions
  - Falls back to a built-in **mock generator** (no external API key required) if no LLM is configured
- One-question-at-a-time quiz UI with Previous/Next navigation and a Submit step
- Automatic server-side scoring, percentage calculation, and a learning-performance label
- Dashboard with document/quiz/score stats, current learning area, and recent results
- Full results history with per-question breakdown and explanations
- MySQL persistence via XAMPP, with all credentials read from `.env` (nothing hard-coded)

---

## 2. Technology Stack

| Layer        | Technology |
|--------------|------------|
| Frontend     | React (Vite), React Router, Axios, custom CSS design system |
| Backend      | Node.js, Express, JWT, bcrypt, Multer |
| AI Service   | Python, FastAPI, PyMuPDF, python-docx, python-pptx |
| Database     | MySQL (via XAMPP / phpMyAdmin) |

---

## 3. Folder Structure

```
skillstat-ai/
├── frontend/            React app (Vite) — runs on http://localhost:3000
├── backend/              Node/Express API — runs on http://localhost:5000
├── ai-service/           Python FastAPI service — runs on http://localhost:8000
├── database/
│   └── schema.sql        Full MySQL schema for the "skillstat_ai" database
└── README.md
```

---

## 4. Prerequisites (Windows)

Install these first:

1. **XAMPP** (includes MySQL + phpMyAdmin) — https://www.apachefriends.org
2. **Node.js** (v18 or later) — https://nodejs.org
3. **Python** (3.10 or later) — https://www.python.org/downloads/ (check "Add Python to PATH" during install)

You will run **three servers** at once, each in its own terminal window (Command Prompt or
PowerShell): the AI service, the backend, and the frontend. XAMPP's MySQL runs in the background
via the XAMPP Control Panel.

---

## 5. Step-by-Step Setup (Windows + XAMPP)

### Step 1 — Start MySQL in XAMPP

1. Open the **XAMPP Control Panel**.
2. Click **Start** next to **MySQL** (Apache is optional — phpMyAdmin needs it, but the app itself
   talks to MySQL directly, not through Apache).
3. Note the port MySQL is running on (default `3306`; the "Admin" button opens phpMyAdmin).

### Step 2 — Create the database

**Option A — phpMyAdmin (recommended for beginners):**

1. In the XAMPP Control Panel, click **Admin** next to MySQL to open phpMyAdmin.
2. Click **Import** in the top menu.
3. Click **Choose File** and select `database/schema.sql` from this project.
4. Click **Go**. This creates the `skillstat_ai` database and all tables.

**Option B — Command line:**

```
cd path\to\skillstat-ai\database
"C:\xampp\mysql\bin\mysql.exe" -u root -p < schema.sql
```
(Press Enter at the password prompt if your XAMPP MySQL root user has no password, which is the default.)

### Step 3 — Configure the backend

```
cd skillstat-ai\backend
copy .env.example .env
```

Open `.env` in a text editor and confirm the database settings match your XAMPP setup:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=skillstat_ai
```

> If your XAMPP MySQL uses a different port (common if MySQL was already installed separately
> and XAMPP moved to 3307 etc.), update `DB_PORT` accordingly. You can check the active port in
> the XAMPP Control Panel next to the MySQL module.

Also set a real value for `JWT_SECRET` (any long random string).

### Step 4 — Install backend dependencies

```
cd skillstat-ai\backend
npm install
```

### Step 5 — Configure and install the AI service

```
cd skillstat-ai\ai-service
copy .env.example .env
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

The AI service works out of the box with **no API key** — it uses a built-in mock quiz
generator that builds real questions directly from your document's content. If you want to use
a real LLM instead, set `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` in `ai-service/.env`.

### Step 6 — Configure and install the frontend

```
cd skillstat-ai\frontend
copy .env.example .env
npm install
```

### Step 7 — Start all three servers

Open **three separate terminal windows**:

**Terminal 1 — AI service:**
```
cd skillstat-ai\ai-service
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Backend:**
```
cd skillstat-ai\backend
npm run dev
```
(or `npm start` if you don't have nodemon installed)

**Terminal 3 — Frontend:**
```
cd skillstat-ai\frontend
npm run dev
```

### Step 8 — Open the app

Visit **http://localhost:3000** in your browser. Register an account, fill in your profile,
upload a document, and take your first personalized quiz.

---

## 6. Environment Variables

### backend/.env
| Variable | Description | Default |
|---|---|---|
| `PORT` | Backend server port | `5000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `JWT_SECRET` | Secret used to sign JWTs | *(set your own)* |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection | XAMPP defaults |
| `AI_SERVICE_URL` | URL of the Python AI service | `http://localhost:8000` |
| `MAX_FILE_SIZE_MB` | Max upload size | `10` |

### ai-service/.env
| Variable | Description |
|---|---|
| `LLM_API_KEY` / `LLM_API_URL` / `LLM_MODEL` | Optional — enables real-LLM quiz generation instead of the mock generator |
| `ALLOWED_ORIGIN` | CORS origin allowed to call this service (the backend) |

### frontend/.env
| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:5000/api` |

---

## 7. API Documentation

All endpoints below (except register/login) require an `Authorization: Bearer <token>` header.

### Auth
- `POST /api/auth/register` — `{ fullName, email, password, confirmPassword }`
- `POST /api/auth/login` — `{ email, password }`
- `GET /api/auth/me`

### Profile
- `GET /api/profile`
- `PUT /api/profile` — `{ designation, department, qualification, experience, interests, skillLevel }`

### Documents
- `POST /api/documents/upload` — multipart form, field name `document`. Extracts text, calls
  the AI service, and stores a ready-to-take 5-question quiz in one step. Returns `{ quizId }`.
- `GET /api/documents` — list of the user's uploaded documents (with their quiz id, if generated)
- `GET /api/documents/:id` — a single document's metadata + extracted text

### Quiz
- `GET /api/quiz/:id` — quiz questions (correct answers are withheld until submission)
- `POST /api/quiz/:id/submit` — `{ answers: { [questionId]: selectedOptionIndex } }` → score, percentage, per-question breakdown, explanations

### Results
- `GET /api/results` — full attempt history + aggregate stats
- `GET /api/results/:id` — a single past attempt, with full breakdown

### Dashboard
- `GET /api/dashboard` — aggregated stats, current learning area, recent results

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Backend logs `MySQL connection failed` | Make sure MySQL is running in XAMPP and `skillstat_ai` database exists (re-import `schema.sql`). Double-check `DB_PORT` in `backend/.env`. |
| Upload fails with "AI service is currently unavailable" | Make sure the FastAPI service is running (`uvicorn app.main:app --port 8000`) and `AI_SERVICE_URL` in `backend/.env` is correct. |
| "Invalid file type" on upload | Only `.pdf`, `.docx`, `.pptx`, and `.txt` are accepted. |
| Port already in use | Change `PORT` in the relevant `.env` file (backend/ai-service) or `server.port` in `frontend/vite.config.js`, then restart. |
| CORS errors in the browser console | Confirm `FRONTEND_URL` in `backend/.env` and `ALLOWED_ORIGIN` in `ai-service/.env` match the URL you're actually opening the frontend on. |
| `pip install` fails on PyMuPDF/python-pptx | Make sure you're using Python 3.10+ and that the virtual environment is activated (`venv\Scripts\activate`) before installing. |
| Quiz generation returns generic-looking questions | This is expected when no `LLM_API_KEY` is set — the mock generator builds questions directly from your document's sentences and keywords. Configure a real LLM in `ai-service/.env` for richer questions. |

---

## 9. Example User Workflow

1. Register with your name, email, and password.
2. You're redirected to your **Profile** — fill in designation, department, qualification,
   experience, interests, and skill level, then save.
3. Go to **Dashboard** to see your profile completion and stats (all zero at first).
4. Go to **Upload Document**, drag in a PDF/DOCX/PPTX/TXT file, and wait a few seconds while it's
   processed.
5. You're taken straight to the **Quiz** page — answer all 5 questions, one at a time.
6. Click **Submit Quiz** to see your **Result**: score, percentage, performance label, and a
   full breakdown of each question with the correct answer and explanation.
7. Return to the **Dashboard** to see your stats updated, or check **Results** for your full
   history, or **My Quizzes** to retake any previous quiz.

---

## 10. Notes on Scope

This version intentionally focuses on the core workflow end-to-end (register → profile →
upload → quiz → score → dashboard) rather than advanced features like iGOT integration,
Docker, or multi-LLM orchestration — those are natural next steps once this foundation is
solid.
