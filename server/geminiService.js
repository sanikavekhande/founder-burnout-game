import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const FALLBACK_GOOGLE_KEY = 'AIzaSyDcPVlmd6Ycskk9ju4fPiBrXT9Cm4M3ee4';

let geminiClient = null;
let initAttempt = null;
let dotenvLoaded = false;
let dotenvInit = null;

async function loadDotenv() {
  if (dotenvLoaded) return;
  if (!dotenvInit) {
    dotenvInit = (async () => {
      try {
        const dotenvModule = await import('dotenv');
        const configFn = dotenvModule.default?.config ?? dotenvModule.config;
        if (typeof configFn === 'function') {
          configFn();
        }
      } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          await hydrateEnvFromFile();
        } else {
          console.warn(`Failed to initialize dotenv (${error.message}).`);
        }
      } finally {
        dotenvLoaded = true;
      }
    })();
  }
  await dotenvInit;
}

function getGoogleKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_KEY ||
    process.env.API_KEY ||
    FALLBACK_GOOGLE_KEY
  );
}

async function ensureModels() {
  await loadDotenv();
  if (geminiClient) return;
  if (!initAttempt) {
    initAttempt = (async () => {
      const apiKey = getGoogleKey();
      if (!apiKey) {
        console.warn('Google API key missing; using heuristic fallbacks.');
        return;
      }
      try {
        geminiClient = new GoogleGenerativeAI(apiKey);
      } catch (error) {
        console.warn(`Gemini SDK unavailable (${error.message}); using heuristic fallbacks.`);
      }
    })();
  }
  await initAttempt;
}

function getGoogleModel() {
  return process.env.GOOGLE_MODEL || 'gemini-1.5-flash';
}

async function getClient(apiKey) {
  if (apiKey) {
    try {
      return new GoogleGenerativeAI(apiKey);
    } catch (error) {
      console.warn('Failed to initialize Gemini client from provided key:', error.message);
      return null;
    }
  }
  await ensureModels();
  return geminiClient;
}

async function requestJSONResponse(client, systemPrompt, userPrompt, temperature = 0.4) {
  if (!client) return null;
  const model = client.getGenerativeModel({
    model: getGoogleModel(),
    systemInstruction: systemPrompt,
    generationConfig: { temperature }
  });
  const result = await model.generateContent(userPrompt);
  const text = result?.response?.text()?.trim();
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn('Failed to parse Gemini JSON response:', cleaned);
    throw error;
  }
}

const INTENT_SNIPPETS = {
  funding: {
    title: 'Pitch decks and promises',
    description: 'You obsessed over investors and runway math.',
    hook: 'Protect whatever leverage you still have.'
  },
  rest: {
    title: 'Emergency recovery sprint',
    description: 'You actually prioritized human beings for a minute.',
    hook: 'Guard the breather before chaos returns.'
  },
  ethics: {
    title: 'Governance clean-up',
    description: 'You tried to prove you are not a future headline.',
    hook: 'Document the fixes before regulators ask.'
  },
  crisis: {
    title: 'Damage control scramble',
    description: 'Half your week went to firefighting and spin.',
    hook: 'Own the mess before it owns you.'
  },
  build: {
    title: 'Feature factory frenzy',
    description: 'Ship-mode trumped everything else.',
    hook: 'Make sure someone remembers to sleep.'
  },
  default: {
    title: 'Another chaotic week',
    description: 'Progress and panic traded punches.',
    hook: 'Pick one priority next round.'
  }
};

function inferIntentFromText(text = '') {
  const lower = text.toLowerCase();
  if (/(fundraise|investor|vc|angel|pitch|term sheet|runway)/.test(lower)) return 'funding';
  if (/(burnout|rest|mental|therapy|sleep|offsite|retreat|hiring|hire)/.test(lower)) return 'rest';
  if (/(ethic|governance|compliance|privacy|regulator|safety|trust)/.test(lower)) return 'ethics';
  if (/(outage|crash|fire|leak|lawsuit|crisis)/.test(lower)) return 'crisis';
  if (/(ship|launch|feature|deployment|build|sprint)/.test(lower)) return 'build';
  return 'default';
}

function fallbackMeterDeltas(intent, text, sentiment, buzzword, feasibility) {
  const deltas = { burnout: 0, funding: 0, ethics: 0 };
  switch (intent) {
    case 'funding':
      deltas.funding += 11;
      deltas.burnout += 6;
      deltas.ethics -= 3;
      break;
    case 'rest':
      deltas.burnout -= 12;
      deltas.ethics += 4;
      deltas.funding -= 4;
      break;
    case 'ethics':
      deltas.ethics += 9;
      deltas.funding -= 2;
      break;
    case 'crisis':
      deltas.burnout += 14;
      deltas.ethics -= 6;
      break;
    case 'build':
      deltas.burnout += 7;
      deltas.funding += 3;
      break;
    default:
      break;
  }
  deltas.ethics -= (buzzword - 50) * 0.05;
  deltas.funding += (feasibility - 50) * 0.09;
  deltas.burnout += (65 - sentiment) * 0.05;
  if (/\btransparen|audit|report\b/i.test(text)) deltas.ethics += 5;
  if (/\bhire|hiring|team\b/i.test(text)) deltas.burnout -= 5;
  return deltas;
}

// Lightweight offline heuristics so the game remains playable without Gemini.
function heuristicScores(text) {
  const normalizedLength = Math.min(text.length / 280, 1);
  const sentiment = Math.round(35 + normalizedLength * 40);
  const buzzwordCount = (text.match(/\b(AI|synergy|pivot|scale|hyper|runway|NFT|blockchain)\b/ig) || []).length;
  const buzzword = Math.min(20 + buzzwordCount * 15, 85);
  const hasNumbers = /\b\d+%?|\b\d+\b/.test(text);
  const feasibility = Math.max(30, hasNumbers ? 70 - buzzwordCount * 5 : 55 - buzzwordCount * 10);
  const intent = inferIntentFromText(text);
  const scenario = INTENT_SNIPPETS[intent] || INTENT_SNIPPETS.default;
  return {
    sentiment,
    buzzword: Math.round(buzzword),
    feasibility: Math.round(Math.min(feasibility, 95)),
    intent,
    meterDeltas: fallbackMeterDeltas(intent, text, sentiment, buzzword, feasibility),
    scenario,
    source: 'heuristic'
  };
}

const MILESTONE_DEFINITIONS = {
  product: {
    title: 'Ship V1',
    stages: [
      { label: 'Concept', status: 'Sketching the vision and chasing the first prototype' },
      { label: 'Prototype', status: 'Alpha version limping through early demos' },
      { label: 'Launch', status: 'Public launch spiking user curiosity' },
      { label: 'Scale', status: 'Version 2 shipping weekly with users sticking around' }
    ]
  },
  funding: {
    title: 'Secure Series A',
    stages: [
      { label: 'Door knocking', status: 'Warm intros and cold emails dominate the calendar' },
      { label: 'Term sheet whispers', status: 'Partners circling as metrics improve' },
      { label: 'Diligence gauntlet', status: 'Data room open, tough questions flying in' },
      { label: 'Money in the bank', status: 'Wire hit, new board member ready to meddle' }
    ]
  },
  team: {
    title: 'Keep Team Together',
    stages: [
      { label: 'Hopeful', status: 'Team buzzing on vision and caffeine' },
      { label: 'Grinding', status: 'Burnout creeping while deadlines loom' },
      { label: 'Stabilizing', status: 'Processes, rest, and clarity return' },
      { label: 'Thriving', status: 'Proud, sustainable, and celebrating the wins' }
    ]
  }
};

function clampValue(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function getDefaultNarrative() {
  return {
    npc: { vcMood: 0, employeeMorale: 0 },
    milestones: Object.entries(MILESTONE_DEFINITIONS).map(([id, def]) => ({
      id,
      title: def.title,
      stage: 0,
      status: def.stages[0].status,
      progressLabel: def.stages[0].label
    })),
    sceneLog: []
  };
}

function normalizeNarrative(narrative) {
  if (!narrative) return getDefaultNarrative();
  const base = { ...narrative };
  base.npc = base.npc || { vcMood: 0, employeeMorale: 0 };
  base.milestones = Array.isArray(base.milestones) && base.milestones.length
    ? base.milestones.map(ms => {
        const def = MILESTONE_DEFINITIONS[ms.id];
        if (!def) return ms;
        const stage = ms.stage ?? 0;
        const info = def.stages[stage] || def.stages[def.stages.length - 1];
        return {
          id: ms.id,
          title: def.title,
          stage,
          status: ms.status || info.status,
          progressLabel: ms.progressLabel || info.label
        };
      })
    : getDefaultNarrative().milestones;
  base.sceneLog = Array.isArray(base.sceneLog) ? base.sceneLog.slice(-12) : [];
  return base;
}

export function updateNarrativeState(prevNarrative, deltas, meters, updateText, nlp) {
  const narrative = normalizeNarrative(prevNarrative);
  const sentimentShift = (nlp.sentiment - 50) * 0.05;
  const intent = nlp.intent || inferIntentFromText(updateText);
  narrative.npc.vcMood = clampValue(
    (narrative.npc.vcMood || 0) + (deltas.funding || 0) * 0.35 + sentimentShift,
    -10,
    10
  );
  narrative.npc.employeeMorale = clampValue(
    (narrative.npc.employeeMorale || 0) - (deltas.burnout || 0) * 0.4 + (deltas.ethics || 0) * 0.2 + sentimentShift,
    -10,
    10
  );
  const changes = [];
  narrative.milestones = narrative.milestones.map(ms => {
    const def = MILESTONE_DEFINITIONS[ms.id];
    if (!def) return ms;
    const previousStage = ms.stage ?? 0;
    let newStage = previousStage;
    switch (ms.id) {
      case 'product':
        if (newStage < 1 && (meters.funding > 45 || intent === 'build')) newStage = 1;
        if (newStage < 2 && (meters.funding > 60 && meters.burnout < 65)) newStage = 2;
        if (newStage < 3 && (meters.funding > 75 && meters.burnout < 50 && meters.ethics > 45)) newStage = 3;
        break;
      case 'funding':
        if (newStage < 1 && (meters.funding > 55 || intent === 'funding')) newStage = 1;
        if (newStage < 2 && meters.funding > 70) newStage = 2;
        if (newStage < 3 && meters.funding > 85 && meters.ethics > 35) newStage = 3;
        break;
      case 'team':
        if (newStage < 1 && (meters.burnout < 55 || intent === 'rest')) newStage = 1;
        if (newStage < 2 && (meters.burnout < 40 && meters.ethics > 55)) newStage = 2;
        if (newStage < 3 && (meters.burnout < 32 && meters.ethics > 65)) newStage = 3;
        break;
      default:
        break;
    }
    const stageInfo = def.stages[newStage] || def.stages[def.stages.length - 1];
    const next = {
      ...ms,
      stage: newStage,
      status: stageInfo.status,
      progressLabel: stageInfo.label
    };
    if (newStage > previousStage) {
      changes.push({
        id: ms.id,
        title: ms.title,
        stage: newStage,
        previousStage,
        status: stageInfo.status,
        progressLabel: stageInfo.label,
        thresholdsMet: {
          burnout: meters.burnout,
          funding: meters.funding,
          ethics: meters.ethics
        }
      });
    }
    return next;
  });
  return { narrative, changes };
}

async function hydrateEnvFromFile() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const raw = await readFile(envPath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to read .env file (${error.message}).`);
    }
  }
}

function shouldAllowFallback() {
  return process.env.GOOGLE_ALLOW_FALLBACK === 'true';
}

export async function analyzeUpdate(text, gameState, apiKey) {
  const client = await getClient(apiKey);
  
  const contextPrompt = `Company: ${gameState.company.name} (${gameState.company.industry}, ${gameState.company.tech})
Founder traits: ${gameState.traits.join(', ') || 'none'}
Round: ${gameState.round}/26
Current meters: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}

Founder update:
"${text}"`;

  try {
    if (!client) {
      if (!shouldAllowFallback()) {
        throw new Error('Gemini client unavailable');
      }
      const fallback = heuristicScores(text);
      fallback.source = 'heuristic';
      return fallback;
    }
    const parsed = await requestJSONResponse(
      client,
      `You interpret founder updates for a burnout management sim.
Return strict JSON with:
- "sentiment" (0-100)
- "buzzword" (0-100)
- "feasibility" (0-100)
- "intent" (snake_case like "funding", "rest", "ethics", "crisis", "build")
- "meterDeltas": integers (-15..15) for "burnout", "funding", "ethics" that reflect how the text would change those meters (positive burnout = more exhaustion).
- "scenario": {"title": "headline tied to the update", "description": "2 tight sentences referencing exact details", "hook": "call-to-action"}

Ground EVERYTHING in the provided text/context. No generic archetypes. Output ONLY raw JSON.`,
      contextPrompt
    );
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
      parsed.intent = parsed.intent || inferIntentFromText(text);
      if (!parsed.meterDeltas) {
        parsed.meterDeltas = fallbackMeterDeltas(parsed.intent, text, parsed.sentiment ?? 50, parsed.buzzword ?? 50, parsed.feasibility ?? 55);
      }
      if (!parsed.scenario) {
        parsed.scenario = INTENT_SNIPPETS[parsed.intent] || INTENT_SNIPPETS.default;
      }
    }
    return parsed;
  } catch (error) {
    console.error('OpenAI analysis error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return heuristicScores(text);
  }
}

// NPC quips when the model is unreachable.
function fallbackDialogue(meters) {
  const fundingScore = (meters.funding || 0) / 100;
  return {
    vc: fundingScore > 0.6 ? "Runway story is working. Keep pushing." : "Not seeing the cash pop yet.",
    employee: meters.burnout > 60 ? "We're burning out." : "Managing for now."
  };
}

export async function generateNPCDialogue(gameState, deltas, intentHint, apiKey) {
  const client = await getClient(apiKey);
  
  const { meters } = gameState;
  const vcMood = gameState.narrative?.npc?.vcMood ?? 0;
  const employeeMorale = gameState.narrative?.npc?.employeeMorale ?? 0;
  const lastIntent = intentHint || gameState.lastIntent || 'unspecified';
  
  const prompt = `Generate NPC dialogue based on current state:

Metrics (with changes):
- Burnout: ${meters.burnout} (${deltas.burnout >= 0 ? '+' : ''}${(deltas.burnout ?? 0).toFixed(1)})
- Funding: ${meters.funding} (${deltas.funding >= 0 ? '+' : ''}${(deltas.funding ?? 0).toFixed(1)})
- Ethics: ${meters.ethics} (${deltas.ethics >= 0 ? '+' : ''}${(deltas.ethics ?? 0).toFixed(1)})
- VC mood index (negative = skeptical, positive = impressed): ${vcMood.toFixed(1)}
- Employee morale index (negative = burned out, positive = energized): ${employeeMorale.toFixed(1)}
- Player intent inferred from update: ${lastIntent}

Return this exact JSON format:
{"vc": "VC's comment here", "employee": "Employee's comment here"}`;

  try {
    if (!client) {
      if (!shouldAllowFallback()) throw new Error('Gemini client unavailable');
      return fallbackDialogue(meters);
    }
    const parsed = await requestJSONResponse(
      client,
      `You write darkly comedic NPC dialogue for a founder burnout simulator.

VC Character: Transactional venture capitalist. Speaks in clichés like "circle back," "runway," "traction." Enthusiastic only when metrics spike. Dismissive when numbers drop. Maximum 15 words.

Employee Character: Burnt-out but honest. Uses informal language. Supportive when things go well, but blunt about unsustainable pace. Maximum 18 words.

Never break character. Output ONLY the requested JSON format.`,
      prompt,
      0.5
    );
    if (parsed) return parsed;
    return fallbackDialogue(meters);
  } catch (error) {
    console.error('Gemini NPC error:', error);
    return fallbackDialogue(meters);
  }
}

function heuristicInsights(updateText, deltas, nlp) {
  const headlineOptions = [
    'Tiny startup makes cautious progress',
    'Investors squint at the metrics',
    'Team grinds while hype cools',
    'Weekend slide deck gains dust'
  ];
  const burnoutHigh = deltas.burnout > 6 || nlp.sentiment < 45;
  const fundingPop = deltas.funding > 8;
  const intent = nlp.intent || inferIntentFromText(updateText);
  
  const tip = burnoutHigh
    ? 'Dial back sprinting before morale snaps.'
    : fundingPop
      ? 'Double down on narrative while momentum lasts.'
      : intent === 'ethics'
        ? 'Document the reforms before cynicism creeps back.'
        : 'Pick one priority this week and over-resource it.';
  
  const buzz = (updateText.match(/\bAI|LLM|automation|platform|viral|growth\b/gi) || []).length;
  const headline = buzz > 1
    ? 'Buzzwords fly, traction TBD'
    : headlineOptions[Math.floor(Math.random() * headlineOptions.length)];
  
  return { tip, headline, source: 'heuristic' };
}

export async function generateInsights(gameState, deltas, nlp, updateText, apiKey) {
  const client = await getClient(apiKey);
  
  if (!client) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini client unavailable');
    }
    return heuristicInsights(updateText, deltas, nlp);
  }
  
  const prompt = `Advisor briefing for founder update.

Company: ${gameState.company.name || 'Unnamed'} (${gameState.company.industry}, ${gameState.company.tech})
Traits: ${gameState.traits.join(', ') || 'None'}
Round: ${gameState.round}/26
Intent inferred from update: ${nlp.intent || inferIntentFromText(updateText)}
Meters now: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}
Deltas: ${JSON.stringify(deltas)}
NLP: ${JSON.stringify(nlp)}
Update text: "${updateText}"

Return JSON: {"tip": "advisor tip", "headline": "news headline"}`;
  
  try {
    const parsed = await requestJSONResponse(
      client,
      `You are a seasoned startup board advisor and tech journalist rolled into one.

From the exact update text plus the latest meters/deltas, craft:
- A concise, punchy advisor tip (<= 18 words) grounded in the real situation.
- A newsy headline (<= 12 words) that echoes how the outside world would report it.

Tone: darkly witty but actionable. Output ONLY JSON.`,
      prompt,
      0.4
    );
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
    }
    return parsed;
  } catch (error) {
    console.error('Gemini insight error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return heuristicInsights(updateText, deltas, nlp);
  }
}

function fallbackSceneCard(updateText, nlp, deltas, milestoneEvents) {
  const intent = nlp.intent || inferIntentFromText(updateText);
  const snippet = INTENT_SNIPPETS[intent] || INTENT_SNIPPETS.default;
  const trimmed = updateText.length > 160 ? `${updateText.slice(0, 157)}...` : updateText;
  let narrative = `You told the world: "${trimmed}".`;
  if ((deltas.funding || 0) > 6) {
    narrative += ' Investors perked up and runway math relaxed.';
  } else if ((deltas.funding || 0) < -4) {
    narrative += ' Cash looks shakier than last week.';
  }
  if ((deltas.burnout || 0) > 6) {
    narrative += ' Slack statuses read "OOO (mentally)".';
  } else if ((deltas.burnout || 0) < -4) {
    narrative += ' Team morale finally caught a breather.';
  }
  const hook = milestoneEvents && milestoneEvents[0]?.hook
    ? milestoneEvents[0].hook
    : snippet.hook;
  return { title: snippet.title, narrative, hook, source: 'heuristic' };
}

function fallbackMilestoneEvents(changes) {
  if (!changes || !changes.length) return [];
  return changes.map(change => {
    const def = MILESTONE_DEFINITIONS[change.id];
    const stageInfo = def?.stages[change.stage] || def?.stages[def.stages.length - 1] || {};
    let hook;
    if (change.stage >= (def?.stages.length || 4) - 1) {
      hook = '🏁 Milestone complete';
    } else if (change.id === 'funding') {
      hook = 'Capitalize on investor interest before it cools.';
    } else if (change.id === 'team') {
      hook = 'Protect the humans building this thing.';
    } else {
      hook = 'Momentum is fragile -- decide how to amplify it.';
    }
    return {
      id: change.id,
      title: change.title,
      summary: stageInfo.status || change.status,
      hook,
      highlight: hook,
      status: stageInfo.status || change.status,
      progressLabel: stageInfo.label || change.progressLabel,
      source: 'heuristic'
    };
  });
}

function fallbackPostMortem(history, finalState, ending) {
  const rounds = (history?.length || 0) + 1;
  const fundingValues = (history || []).map(item => item?.meters?.funding ?? item?.funding ?? 0);
  fundingValues.push(finalState?.meters?.funding ?? 0);
  const burnoutValues = (history || []).map(item => item?.meters?.burnout ?? item?.burnout ?? 100);
  burnoutValues.push(finalState?.meters?.burnout ?? 100);
  const ethicsValues = (history || []).map(item => item?.meters?.ethics ?? item?.ethics ?? 0);
  ethicsValues.push(finalState?.meters?.ethics ?? 0);
  return `After ${rounds} chaotic weeks you landed at "${ending.title}". ` +
    `Funding peaked near ${Math.round(Math.max(...fundingValues))}, burnout bottomed at ${Math.round(Math.min(...burnoutValues))}, ` +
    `and ethics topped out around ${Math.round(Math.max(...ethicsValues))}. ` +
    'Investors will be passing this memo around their Monday standup.';
}

export async function generateSceneCard(gameState, deltas, nlp, updateText, narrative, milestoneEvents, apiKey) {
  const client = await getClient(apiKey);
  if (!client) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini client unavailable');
    }
    return fallbackSceneCard(updateText, nlp, deltas, milestoneEvents);
  }
  const milestoneSummary = (milestoneEvents || []).map(evt => `- ${evt.title}: ${evt.summary}`).join('\n') || 'None this round';
  const prompt = `Craft a concise round recap for a startup sim.

Context:
- Company: ${gameState.company.name || 'Unnamed'}
- Update text: "${updateText}"
- Intent inferred from text: ${nlp.intent || inferIntentFromText(updateText)}
- Metrics: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}
- Deltas: ${JSON.stringify(deltas)}
- NLP scores: ${JSON.stringify(nlp)}
- Milestones touched:\n${milestoneSummary}

Return JSON: {"title": "short title", "narrative": "2 short sentences", "hook": "one recommendation"}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Craft vivid but concise recap cards for a founder burnout simulator. Output STRICT JSON.`,
      prompt,
      0.5
    );
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
    }
    return parsed;
  } catch (error) {
    console.error('Gemini scene card error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackSceneCard(updateText, nlp, deltas, milestoneEvents);
  }
}

export async function generateMilestoneNarratives(gameState, narrative, changes, deltas, nlp, updateText, apiKey) {
  const client = await getClient(apiKey);
  if (!changes || !changes.length) return [];
  if (!client) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini client unavailable');
    }
    return fallbackMilestoneEvents(changes);
  }

  const changeSummary = changes.map(change => {
    const def = MILESTONE_DEFINITIONS[change.id];
    return {
      id: change.id,
      title: change.title,
      stage: change.stage,
      previousStage: change.previousStage,
      label: def?.stages[change.stage]?.label,
      status: def?.stages[change.stage]?.status,
      thresholdsMet: change.thresholdsMet
    };
  });

  const prompt = `Milestone progress update.

Company: ${gameState.company.name || 'Unnamed'}
Update text: "${updateText}"
Intent inferred: ${nlp.intent || inferIntentFromText(updateText)}
Metric deltas: ${JSON.stringify(deltas)}
Milestones needing new copy: ${JSON.stringify(changeSummary)}

Return JSON array like:
[{"id":"product","summary":"New status line","hook":"Next step nudge","progressLabel":"Stage name"}]`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Write one-sentence milestone summaries for a founder burnout sim. Output ONLY JSON arrays.`,
      prompt,
      0.4
    );
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        ...item,
        highlight: item.highlight || item.hook || null,
        source: item.source || 'openai'
      }));
    }
    return fallbackMilestoneEvents(changes);
  } catch (error) {
    console.error('Gemini milestone error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackMilestoneEvents(changes);
  }
}

export async function generatePostMortem(history, finalState, ending, apiKey) {
  const client = await getClient(apiKey);
  if (!client) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini client unavailable');
    }
    return fallbackPostMortem(history, finalState, ending);
  }
  const prompt = `Write a dryly witty investor-style post-mortem for a founder burnout sim run.

Ending reached: ${ending.title}
Ending narrative: ${ending.text}
Final meters: ${JSON.stringify(finalState.meters)}
Rounds of history: ${history.length}
History sample: ${JSON.stringify(history.slice(-5))}

Return JSON: {"memo": "short paragraph"}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Write dryly witty investor-style post-mortems for a founder burnout simulator. Output ONLY JSON objects.`,
      prompt,
      0.35
    );
    if (typeof parsed === 'object' && parsed?.memo) {
      return parsed.memo;
    }
    return fallbackPostMortem(history, finalState, ending);
  } catch (error) {
    console.error('Gemini post-mortem error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackPostMortem(history, finalState, ending);
  }
}
