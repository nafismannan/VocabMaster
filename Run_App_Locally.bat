@echo off
echo Starting VocabMaster Bengali...
echo.
echo Step 1: Installing dependencies (this may take a minute on first run)...
call npm install
echo.
echo Step 2: Launching the application...
echo.
echo The app will open in your browser shortly. 
echo Keep this window open while using the app.
echo.
start http://localhost:3000
npm run dev
pause
