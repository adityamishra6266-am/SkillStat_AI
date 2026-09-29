@echo off
title SkillStat AI - Start All Servers
echo ==========================================
echo        SkillStat AI Server Launcher
echo ==========================================
echo.

REM Project location
set "PROJECT=D:\PROJECT\SIHPROJECT\SkillStat_AI"

REM Check project folder
if not exist "%PROJECT%" (
    echo ERROR: Project folder not found:
    echo %PROJECT%
    pause
    exit /b 1
)

echo Starting AI Service on port 8000...
start "SkillStat AI - AI Service" cmd /k "cd /d %PROJECT%\ai-service && call venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo Starting Backend on port 5000...
start "SkillStat AI - Backend" cmd /k "cd /d %PROJECT%\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Frontend on port 3000...
start "SkillStat AI - Frontend" cmd /k "cd /d %PROJECT%\frontend && npm run dev -- --port 3000"

echo.
echo ==========================================
echo All servers are starting...
echo.
echo AI Service: http://localhost:8000
echo Backend:    http://localhost:5000
echo Frontend:   http://localhost:3000
echo ==========================================
echo.
echo Opening the website in your browser...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000/"

exit /b 0
