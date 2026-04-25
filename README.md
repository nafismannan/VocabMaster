# VocabMaster Bengali

A modern English-to-Bengali vocabulary builder and sentence analyzer powered by Gemini AI.

## Features
- **AI Word Search**: Get Bengali meanings, word forms, synonyms, and antonyms.
- **Sentence Analysis**: Breakdown English sentences word-by-word with parts of speech.
- **Interactive Quiz**: 20-question randomized quizzes with performance tracking and charts.
- **Theme Support**: 5 beautiful color themes.
- **Export**: Save your vocabulary list as a CSV file.

## GitHub Deployment Guide

This project is configured for automatic deployment to **GitHub Pages**.

### 1. Repository Setup
1. Create a new repository on GitHub.
2. Push this code to your repository's `main` branch.

### 2. Configure API Key
Since this app uses the Gemini API, you must provide an API key during the build process:
1. Go to your GitHub repository's **Settings**.
2. Navigate to **Secrets and variables** > **Actions**.
3. Create a **New repository secret**:
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API Key (get one from [Google AI Studio](https://aistudio.google.com/app/apikey)).

### 3. Enable GitHub Pages
1. Go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. The next time you push to `main`, the `.github/workflows/deploy.yml` will automatically build and deploy your site.

## Netlify Deployment Guide
This project is optimized for deployment on **Netlify**.

### 1. Connect Repository
1. Log in to your [Netlify](https://www.netlify.com/) account.
2. Click **Add new site** > **Import an existing project**.
3. Connect your GitHub repository.

### 2. Build Settings
Netlify will automatically detect the settings from `netlify.toml`:
- **Build command**: `npm run build`
- **Publish directory**: `dist`

### 3. Configure Environment Variables
1. In the Netlify UI, go to **Site configuration** > **Environment variables**.
2. Add a new variable:
   - Key: `GEMINI_API_KEY`
   - Value: Your Gemini API Key.

### 4. Deploy
Click **Deploy site**. Netlify will build the app and provide you with a live URL.

## Desktop Application (.exe) for PC
This project is configured to be built as a standalone Windows application using **Electron**.

### How to Build the .exe:
1. **Export the Project**: Use the "Export to ZIP" option in the AI Studio settings menu to download the full source code to your computer.
2. **Install Node.js**: Ensure you have [Node.js](https://nodejs.org/) installed on your PC.
3. **Install Dependencies**: Open a terminal in the project folder and run:
   ```bash
   npm install
   ```
4. **Build the Application**:
   ```bash
   npm run electron:build
   ```
5. **Find your .exe**: Once the build completes, look in the `release/` folder for the `VocabMaster Bengali.exe` file.

*Note: You will still need to provide your `GEMINI_API_KEY` in a `.env` file or as an environment variable for the AI features to work in the desktop app.*

## Local Development
### The Easiest Way (Windows)
1. Export the project to ZIP and extract it.
2. Double-click the **`Run_App_Locally.bat`** file.
3. This will automatically install everything and open the app in your browser.

### Manual Way
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file and add `GEMINI_API_KEY=your_key_here`.
4. Run `npm run dev`.
