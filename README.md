# Burnout in Silly-con Valley – Teacher Guide

Hi Kaz! Burnout in Silly-con Valley is a satirical “founder speedrun” where players invent a startup, write weekly investor updates, and let Google’s Gemini model roast them with newspaper headlines, Slack snark, and meter swings for Ethics, Funding, and Burnout. It’s intentionally tongue-in-cheek—think of it as a playable critique of hustle culture that still showcases a responsive AI-driven narrative loop.

This README explains how to launch the prototype locally and what to expect once it’s running. Follow the steps in order for a smooth evaluation session.

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 18+** | Use `node -v` to confirm. Install from [nodejs.org](https://nodejs.org) if needed. |
| **npm 9+** | Bundled with Node. |
| **Google Gemini API key** | Required for all AI-generated content. Request via Google AI Studio, then keep it private. |

---

## 2. Install Dependencies & Overview

Before you dive in, here’s the quick gist of the experience:

- **Setup screen**: Define a fake company (name, founder, industry, tech stack, two traits).
- **Gameplay**: Each “month” you read the auto-generated “Silicon Valley Newspaper” headline + NPC Slack banter, then submit a 1–3 sentence update. Gemini 2.5 Flash analyzes it and swings the meters with severity multipliers.
- **Goal**: Survive 10 months without funding hitting 0 or burnout exceeding 80; endings like “Runway Reset” or “Spicy Collapse” sum up your run with humor.

Now install dependencies:

1. **Open a terminal** at the project root (`founder-burnout-game/`).
2. Run `npm install` once to pull server dependencies (`express`, `@google/genai`, etc.).

```
npm install
```

> Tip: if you already installed packages previously, you can skip this step unless `package-lock.json` changed.

---

## 3. Configure Environment Variables

Create a `.env` file in the project root with your Gemini API key:

```
GOOGLE_API_KEY=YOUR_REAL_KEY_HERE
```

Accepted variable names (any one works): `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GEMINI_KEY`, or `API_KEY`. The backend looks for them in that order.

Keep the key private—do not commit `.env` to version control.

---

## 4. Start the Server

Run the Express server on port 3000:

```
npm start
```

You should see:

```
🚀 Server running on http://localhost:3000
📊 Game ready at http://localhost:3000
```

Leave this terminal window open; it streams Gemini call logs and error details.

---

## 5. Launch the Game

1. Open a browser (Chrome recommended).
2. Navigate to `http://localhost:3000`.
3. The **Setup Screen** appears with the “Burnout in Silly-con Valley” hero title and trait selectors. Follow the flow described above and in the in-app How to Play panel.

---

## 6. Operating the Prototype

### A. Setup
1. Enter a **Company Name** (defaults to “StartupCo”).
2. Add an optional **Founder Name** (used only in narration).
3. Choose an **Industry** and **Tech Stack** from the dropdowns (these feed the prompts).
4. Select **exactly two traits**; the “Begin the Grind” button enforces this.
5. Click **“Begin the Grind.”**

### B. Reading Each Prompt
- The **“Silicon Valley Newspaper”** card is always populated by the most recent Gemini response. Headline + CTA tell you what fresh chaos you’re reacting to; the highlight pill shows which meter was hit hardest.

### C. Gameplay Loop
Each round follows the same flow:
1. **Read** the headline + NPC Slack messages (left column).
2. **Type** a 1–3 sentence update in the textarea (examples provided in the placeholder).
3. Click **“Submit Update.”**
4. Watch the UI react:
   - Newspaper headline + CTA rewrite instantly (CTA turns green for “good” moves, red text for “bad” ones).
   - VC/Employee Slack bubbles update with new satire.
   - Productivity impact / mood signal / event relevance scores refresh in the Analysis panel (green = great, yellow = neutral, red = risky).
   - Trait alignment pills show how well the update matched Ambition, Integrity, Charisma, and Resilience (highlighting the two you chose).
   - Ethics, Funding, and Burnout bars swing—severity multipliers amplify big mistakes.
   - Founder profile card (right column) stays in sync with name, traits, and mini-meters.
5. Repeat until **Month 10**.

> Behind the scenes, high trait alignment dampens negative meter swings (and boosts positive ones), while low productivity/mood/relevance scores make deltas hit harder—so thoughtful, on-theme updates literally keep the gauges steadier.

### D. End Screen
- After month 10 or an early failure, the ending screen shows:
  - Badge (“Runway Reset” for win / “Spicy Collapse” for loss) with win/loss colors.
  - Final Ethics/Funding/Burnout meters.
  - Punchy summary plus founder profile recap (name, industry, traits).
- Use **“Spin It Again”** to restart without refreshing the page.

---

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| **“Server error (500)” or console shows `503 Service Unavailable`** | Gemini is overloaded. Wait a minute and try again; no local fix is needed. |
| **Cannot start (`EADDRINUSE`)** | Something else uses port 3000. Stop the other process or change the port in `server/server.js`. |
| **“Pick exactly two founder superpowers.” alert** | You must check two trait cards before starting. |
| **Headline never appears** | Ensure `.env` is configured correctly and the terminal shows a valid Gemini response. |

---

## 8. Project Structure (For Reference)

```
founder-burnout-game/
├── public/
│   ├── index.html      # UI markup
│   ├── styles.css      # Styling + layout
│   └── game.js         # Frontend logic + fetch calls
├── server/
│   ├── server.js       # Express API + static hosting
│   ├── geminiService.js# Prompt builders + Gemini SDK calls
│   └── gameLogic.js    # Meter math, endings, narratives
├── package.json
└── README.md           # This guide
```

---

## 9. Evaluation Checklist

Use this quick list to confirm everything works as designed:

1. ✅ Server starts on port 3000 with no missing dependency errors.  
2. ✅ Setup screen displays hero text, trait cards, and instructions.  
3. ✅ Intro headline loads automatically before the first input.  
4. ✅ Submitting an update refreshes headline, NPC chat, metrics, and profile card.  
5. ✅ After ten months (or early failure), the ending screen shows badge, summary, meters, and founder recap.  
6. ✅ “Spin It Again” returns to setup without reloading the page.

If all boxes are checked, the prototype is operating as intended.

---

Happy evaluating! Feel free to capture screen recordings or notes directly from `http://localhost:3000` while the server runs. If you encounter unexpected behavior, grab the logs from the terminal window—they include every Gemini request and will help the team debug quickly.
