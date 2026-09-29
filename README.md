# SkillStat AI — Adaptive Competency Learning Platform

**SIH 2026 — Problem Statement 26101: AI-enabled learning platform for India's
Official Statistical System.**

> Status: **SIH 2026 PS 26101 — Final Prototype / Demo Ready.** This is a
> working prototype built for demonstration, not a production government
> deployment. See [Prototype Limitations](#9-prototype-limitations) for
> exactly what that means.

SkillStat AI helps an official in the statistical system see where their
skills stand against what their role requires, learn the right thing next,
and prove it closed the gap — automatically, every time they learn something.

---

## 1. How SkillStat AI solves PS 26101

The platform demonstrates one continuous, evidence-based adaptive learning
cycle, not a set of disconnected pages:

```
 ASSESS -> IDENTIFY GAP -> RECOMMEND -> LEARN -> REASSESS -> IMPROVE
```

1. **Official Profile** - designation, department, qualification, experience,
   interests and skill level.
2. **Competency Mapping** - the profile is mapped to an existing, fixed
   competency framework (`competencies` / `competency_requirements`) using a
   transparent, deterministic baseline plus any recorded assessment evidence.
3. **AI-Assisted Assessment** - a curated, competency-tagged question bank is
   the primary and always-reliable source; a configured LLM may only *top up*
   gaps the bank cannot cover. The UI always says which one actually ran.
4. **Skill Gap Analysis** - required level vs. current level, per competency,
   classified into Critical / High / Medium / Low.
5. **Personalized Recommendations** - learning resources ranked by gap
   priority, difficulty and prerequisites, each with a plain-language reason
   built from the real numbers.
6. **iGOT / NSSTA Learning Path** - recommendations turned into one ordered,
   prerequisite-aware path with Locked / Available / In Progress / Completed
   steps.
7. **Learning Material Upload** - PDF / DOCX / PPTX / TXT.
8. **AI Quiz Generation** - a personalized 5-question quiz built from the
   uploaded document (LLM-generated when configured, otherwise a
   deterministic extractive generator built from the document's own text).
9. **Assessment Evidence** - each quiz question is mapped to the *existing*
   competency framework, or left unmapped when no reliable match exists - a
   mapping is never fabricated.
10. **Competency Update** - mapped evidence blends into the competency score.
11. **Adaptive Recalculation** - skill gaps, recommendations and the learning
    path are recalculated automatically after every scored attempt, and the
    Result page shows exactly which of those steps ran.
12. **Workforce Analytics** - an administrator dashboard aggregates all of the
    above across every official, with no fabricated figures.

---

## 2. Architecture

| Layer        | Technology |
|--------------|------------|
| Frontend     | React (Vite), React Router, Axios, custom CSS design system |
| Backend      | Node.js, Express, JWT, bcrypt, Multer |
| AI Service   | Python, FastAPI, PyMuPDF, python-docx, python-pptx |
| Database     | MySQL / MariaDB (works with XAMPP's MySQL too) |

**AI**: LLM-assisted where an LLM is configured; a curated bank / deterministic
extractive generator / keyword-based competency matcher otherwise. The UI
always labels which one actually produced a given assessment.

**Learning providers**: `iGOT Karmayogi` and `NSSTA / TPAC` prototype/mock
adapters (`backend/src/providers/`). There are no live provider credentials in
this project - see [Prototype Limitations](#9-prototype-limitations).

```
frontend/       React app (Vite)
backend/        Express API, competency/gap/recommendation/path engines
ai-service/     FastAPI microservice: text extraction, quiz generation,
                optional LLM competency classification
database/       final_setup.sql (recommended) + individual migrations/seeds
```

---

## 3. Complete setup

Any local MySQL or MariaDB server works, including XAMPP's bundled MySQL.
Examples below use a local install; for XAMPP, start MySQL from the XAMPP
control panel and use the same host/port (default `localhost:3306`, or
whatever your XAMPP config uses - set `DB_PORT` accordingly).

### 3.1 Database

Recommended - one script, safe to re-run, no `mysql` CLI required:

```bash
cd backend
cp .env.example .env      # then edit DB_* to match your MySQL/XAMPP setup
npm install
npm run db:setup
```

Or with the `mysql` CLI directly:

```bash
mysql -u root -p < database/final_setup.sql
```

`database/final_setup.sql` creates every table (`users` ... `diagnostic_questions`)
plus seed data (competency framework, prototype learning catalogue, curated
assessment question bank) in one idempotent script. The individual files under
`database/migrations/` and `database/seeds/` are kept for project history and
for upgrading an existing installation in place - don't mix the two
approaches on the same database.

### 3.2 Backend

```bash
cd backend
npm install                 # if not already done above
cp .env.example .env        # if not already done above
npm run create-admin -- "Admin Name" admin@example.com "StrongPassword1"
npm run dev                 # or: npm start
```

Runs on `http://localhost:5000`. `npm run create-admin` is the only way to
create an administrator account - public registration can never create one.

### 3.3 AI service

```bash
cd ai-service
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # optional: add LLM_API_KEY / LLM_API_URL / LLM_MODEL
uvicorn app.main:app --reload --port 8000
```

Runs on `http://localhost:8000`. Leave the three `LLM_*` variables empty to
run entirely offline - every feature still works (see [Section 4](#4-ai-assisted-vs-fallback-behaviour)).

### 3.4 Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000` (or the port Vite prints) and talks to the
backend at `http://localhost:5000/api` by default - override with
`VITE_API_BASE_URL` in `frontend/.env` if needed.

### 3.5 Start order

MySQL -> AI service -> backend -> frontend. The backend logs a clear message
on startup if it cannot reach MySQL (check `DB_HOST` / `DB_PORT` / `DB_USER` /
`DB_PASSWORD` in `backend/.env`); document upload and quiz generation log a
clear error if the AI service isn't reachable.

---

## 4. AI-assisted vs. fallback behaviour

Every AI-produced result is labelled honestly in the UI - a fallback is never
presented as "AI-generated":

| Feature | With `LLM_API_KEY` + `LLM_API_URL` configured | Without (default) |
|---|---|---|
| Competency assessment | Curated bank, LLM tops up only competencies the bank can't cover -> labelled **"AI-assisted"** | Curated competency bank only -> **"Curated competency bank"** |
| Document quiz | LLM-generated from the document -> **"LLM-generated from your document"** | Deterministic extractive generator built from the document's own sentences -> **"Built from your document text (no LLM)"** |
| Question -> competency mapping | LLM classification, only within the existing framework, only above a confidence threshold | Deterministic weighted keyword matcher against competency names/descriptions |

All LLM output (question count, exactly four options, `correctAnswer` range,
non-empty text/explanation, competency codes restricted to the real framework)
is validated before it is ever stored; anything malformed is discarded and the
system falls back safely rather than breaking.

---

## 5. Prototype learning providers

Learning resources are labelled with their real provider and integration mode:

```
Provider: iGOT Karmayogi        Integration: Prototype / Mock
Provider: NSSTA / TPAC          Integration: Prototype / Mock
```

The provider layer (`backend/src/providers/`) is built to swap a mock adapter
for a live one (`mockIgotProvider` -> a future `igotLiveProvider`, and likewise
for NSSTA) without touching the recommendation, gap or path engines. No
enrolment ID or resource URL is ever fabricated - "Open Resource" is shown
only when a genuine URL exists in the catalogue.

---

## 6. Data integrity

No dashboard, chart or analytics figure is fabricated. Every number is either
read from the database, computed by a backend service from real rows, or
explicitly labelled as prototype catalogue data. Where there's no data yet,
the UI says **"No data available yet"** rather than showing a misleading 0%.

---

## 7. Security

- Passwords are hashed with bcrypt; password hashes and JWTs are never
  returned by any API response.
- Every `/api/admin/*` route requires a valid JWT **and** `role = 'admin'`,
  enforced server-side (`authMiddleware` + `adminOnly`); hiding the admin link
  in the UI is a convenience only, not the security boundary.
- Public registration can never create an admin account.
- A JWT issued before roles existed is treated as an ordinary user token.
- Every quiz/result/document/learning-path route checks ownership as part of
  its query - another user's resource is a 404, not a 403 (no existence leak).
- Uploads are validated by extension, declared MIME type and actual file
  content (magic bytes), with a size limit and empty-file rejection.
- Malformed request bodies return `400`, not a stack trace; all error detail
  is logged server-side only.

---

## 8. Testing performed

- Fresh `final_setup.sql` install verified end-to-end, including re-running it
  twice with no duplication and no data loss.
- Full adaptive loop exercised against a live database: register -> profile ->
  competency mapping -> diagnostic assessment -> competency/gap/recommendation/
  path update -> document upload (both a competency-matched document and an
  unrelated one, confirming the "not mapped" path) -> document quiz ->
  competency-aware update -> Result page -> refreshed from the database.
- Ownership checks: a second user was confirmed unable to read or submit
  another user's quiz, result, document or learning-path item.
- Admin authorization: a learner token and a pre-role JWT were both confirmed
  rejected by every `/api/admin/*` route; an admin account was created only
  via `npm run create-admin`.
- Admin dashboard: date-range filter (7/30/90/all), officials search/
  department/designation/status/competency filters and "Reset Filters",
  official detail drawer (confirmed no password/token/email present), and the
  assessments-over-time chart, all checked against the live database.
- Upload validation: empty file, wrong extension, and a renamed non-document
  file (content sniffing) all correctly rejected.
- Every page rendered against the live backend with no runtime errors,
  including empty-state, loading and populated states.
- `npm run build` (frontend), Node.js syntax checks (`node -c`) on every
  backend file, and Python syntax checks (`py_compile`) on every AI-service
  file all pass.

---

## 9. Prototype limitations

Stated plainly rather than hidden:

- **No live iGOT Karmayogi or NSSTA/TPAC credentials** are configured;
  learning resources come from a labelled prototype catalogue.
- **No LLM is required or configured by default** - the curated question
  bank and deterministic extractive/keyword fallbacks are what make the
  platform fully functional offline; an LLM only enhances it further when
  configured.
- Client-side filtering on the admin Officials table is reasonable at
  prototype scale; a large real deployment would move filtering server-side.
- This is a demonstration prototype for SIH 2026, not a production system -
  it has not been through a formal security audit, load testing, or
  government IT accreditation.
