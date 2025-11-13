import { GoogleGenAI } from '@google/genai';
import { TOTAL_PHASES, getPhaseTitle } from './gameLogic.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_SERVER_KEY = 'AIzaSyB7EUog3GLcaTmEDMJpfXgiX9ZKswO8wiE';
const clientCache = new Map();
const FOUNDER_TRAITS = ['Ambition', 'Integrity', 'Charisma', 'Resilience'];

function formatHistoryContext(history = []) {
  if (!Array.isArray(history) || !history.length) {
    return 'None recorded yet.';
  }
  return history
    .slice(-3)
    .map(entry => {
      const round = entry?.round ?? '?';
      const textSnippet = (entry?.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
      const intent = entry?.intent || entry?.nlp?.intent || 'unknown';
      const meters = entry?.meters || {};
      const ethics = typeof meters.ethics === 'number' ? Math.round(meters.ethics) : '—';
      const burnout = typeof meters.burnout === 'number' ? Math.round(meters.burnout) : '—';
      const funding = typeof meters.funding === 'number' ? Math.round(meters.funding) : '—';
      return `Round ${round}: "${textSnippet}" (intent: ${intent}, meters → Ethics ${ethics}, Burnout ${burnout}, Funding ${funding})`;
    })
    .join('\n');
}

function buildCompanyContext(gameState = {}) {
  const company = gameState.company || {};
  const name = company.name?.trim() || 'Unnamed company';
  const founderName = company.founder?.trim();
  const industry = company.industry || 'Unspecified industry';
  const tech = company.tech || 'Unspecified tech focus';
  const traits = Array.isArray(gameState.traits) && gameState.traits.length
    ? gameState.traits.join(', ')
    : 'No traits selected';
  const founderLine = founderName ? `Founder: ${founderName}` : 'Founder: (not provided)';
  return `${name}\n${founderLine}\nIndustry: ${industry}\nTech focus: ${tech}\nFounder traits: ${traits}`;
}

function latestHeadlineContext(gameState = {}) {
  const log = gameState?.narrative?.sceneLog;
  if (Array.isArray(log) && log.length) {
    const latest = log[log.length - 1] || {};
    const title = latest.title || latest.scenario?.title || 'Unnamed headline';
    const summary = latest.narrative || latest.description || latest.body || latest.scenario?.description || 'No summary captured.';
    const hook = latest.hook || latest.scenario?.hook || 'No hook provided.';
    return `Latest newspaper headline: "${title}". Summary: ${summary}. Current hook/call-to-action: ${hook}`;
  }
  return 'No previous headline yet—this is the first prompt.';
}

function resolveApiKey(explicitKey) {
  const trimmedExplicit = typeof explicitKey === 'string' ? explicitKey.trim() : '';
  if (trimmedExplicit) {
    return trimmedExplicit;
  }
  const envKey =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_KEY ||
    process.env.API_KEY;
  return (envKey && envKey.trim()) || DEFAULT_SERVER_KEY;
}

async function getClient(apiKey) {
  const resolvedKey = resolveApiKey(apiKey);
  if (!resolvedKey) {
    throw new Error('Gemini API key is required to process updates.');
  }
  if (!clientCache.has(resolvedKey)) {
    clientCache.set(resolvedKey, new GoogleGenAI({ apiKey: resolvedKey }));
  }
  return clientCache.get(resolvedKey);
}

async function requestJSONResponse(client, systemPrompt, userPrompt, temperature = 0.4) {
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    config: {
      systemInstruction: systemPrompt,
      temperature,
      responseMimeType: 'application/json'
    }
  });
  const payload = typeof response.text === 'function' ? response.text() : response.text;
  if (!payload) {
    throw new Error('Gemini returned an empty response.');
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON response: ${error.message}`);
  }
}

function inferIntentFromText(text = '') {
  const lower = text.toLowerCase();
  if (/(fundraise|investor|vc|angel|pitch|term sheet|runway)/.test(lower)) return 'funding';
  if (/(burnout|rest|mental|therapy|sleep|offsite|retreat|hiring|hire)/.test(lower)) return 'rest';
  if (/(ethic|governance|compliance|privacy|regulator|safety|trust)/.test(lower)) return 'ethics';
  if (/(outage|crash|fire|leak|lawsuit|crisis)/.test(lower)) return 'crisis';
  if (/(ship|launch|feature|deployment|build|sprint)/.test(lower)) return 'build';
  return 'default';
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

export async function generateIntroScene(gameState, apiKey) {
  const client = await getClient(apiKey);
  const introState = {
    ...gameState,
    round: Math.max(1, gameState?.round || 1),
    narrative: normalizeNarrative(gameState?.narrative)
  };
  const phaseTitle = getPhaseTitle(introState.round);
  const kickoffText = `Kickoff briefing for ${phaseTitle} at ${gameState?.company?.name || 'this startup'}. Summarize the investor gossip, customer sentiment, and internal morale that the founder must respond to immediately.`;
  const nlp = await analyzeUpdate(kickoffText, introState, apiKey);
  const deltas = nlp?.meterDeltas || { burnout: 0, funding: 0, ethics: 0 };
  const sceneCard = await generateSceneCard(
    introState,
    deltas,
    nlp,
    kickoffText,
    introState.narrative,
    [],
    apiKey
  );
  const npcLines = await generateNPCDialogue(introState, deltas, nlp.intent, apiKey);
  const insights = await generateInsights(introState, deltas, nlp, kickoffText, apiKey);
  return {
    sceneCard,
    npcLines,
    insights,
    nlp,
    deltas,
    intentSummary: nlp?.scenario?.description || null
  };
}

export async function analyzeUpdate(text, gameState, apiKey) {
  const client = await getClient(apiKey);
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(gameState.history);
  const headlineContext = latestHeadlineContext(gameState);
  const selectedTraits = Array.isArray(gameState.traits) && gameState.traits.length
    ? gameState.traits.join(', ')
    : 'None selected (default to Ambition & Integrity)';
  const contextPrompt = `Company context:
${companyContext}

Round: ${gameState.round}/${TOTAL_PHASES}
Current meters: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}
${headlineContext}
Traits to evaluate: ${selectedTraits}

Founder update:
"${text}"

Recent rounds (oldest to newest):
${historyContext}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `You interpret founder updates for a burnout management sim. Always ground every field in the provided founder update, company context, founder traits, latest newspaper hook, and history summary (quote concrete metrics or actions where possible). Keep the satire understandable to anyone who has heard of Silicon Valley hustle culture—no deep insider jargon.
Return strict JSON with:
- "productivityImpact" (0-100) → how concrete/actionable the described work is.
- "moodSignal" (0-100) → emotional tone the update broadcasts to stakeholders.
- "eventRelevance" (0-100) → how directly it addresses the current Silicon Valley Newspaper hook.
- "intent" (snake_case like "funding", "rest", "ethics", "crisis", "build")
- "traitFit": object keyed ONLY by the listed founder traits (usually two). Each value is 0-100 showing how well the update embodied that trait. If there is zero evidence, score between 10-20 instead of inventing alignment.
- "meterDeltas": integers (-15..15) for "burnout", "funding", "ethics" that reflect how the text would change those meters (positive burnout = more exhaustion).
- "scenario": {"title": "headline tied to the update", "description": "2 tight sentences referencing exact details", "hook": "call-to-action"}

Ground EVERYTHING in the provided text/context. No generic archetypes. Output ONLY raw JSON.`,
      contextPrompt
    );
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini returned an invalid analysis payload.');
    }
    ['productivityImpact', 'moodSignal', 'eventRelevance'].forEach(key => {
      if (typeof parsed[key] !== 'number') {
        throw new Error(`Gemini analysis missing numeric field "${key}".`);
      }
    });
    const playerTraits =
      (Array.isArray(gameState.traits) && gameState.traits.length && gameState.traits) ||
      FOUNDER_TRAITS.slice(0, 2);
    if (!parsed.traitFit || typeof parsed.traitFit !== 'object') {
      throw new Error('Gemini analysis missing traitFit map.');
    }
    const normalizedTraitFit = {};
    playerTraits.forEach(trait => {
      const raw = parsed.traitFit?.[trait];
      normalizedTraitFit[trait] = typeof raw === 'number' ? raw : 0;
    });
    parsed.traitFit = normalizedTraitFit;
    if (typeof parsed.intent !== 'string' || !parsed.intent) {
      throw new Error('Gemini analysis missing intent.');
    }
    if (!parsed.meterDeltas || typeof parsed.meterDeltas !== 'object') {
      throw new Error('Gemini analysis missing meter deltas.');
    }
    ['burnout', 'funding', 'ethics'].forEach(key => {
      if (typeof parsed.meterDeltas[key] !== 'number') {
        throw new Error(`Gemini analysis missing meter delta for "${key}".`);
      }
    });
    if (!parsed.scenario || typeof parsed.scenario !== 'object') {
      throw new Error('Gemini analysis missing scenario details.');
    }
    ['title', 'description', 'hook'].forEach(prop => {
      if (typeof parsed.scenario[prop] !== 'string') {
        throw new Error(`Gemini scenario missing "${prop}".`);
      }
    });
    return { ...parsed, source: 'gemini' };
  } catch (error) {
    console.error('Gemini analysis error:', error);
    throw error;
  }
}

export async function generateNPCDialogue(gameState, deltas, intentHint, apiKey) {
  const client = await getClient(apiKey);
  
  const { meters } = gameState;
  const vcMood = gameState.narrative?.npc?.vcMood ?? 0;
  const employeeMorale = gameState.narrative?.npc?.employeeMorale ?? 0;
  const lastIntent = intentHint || gameState.lastIntent || 'unspecified';
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(gameState.history);
  
  const prompt = `Generate NPC dialogue based on current state:

Company context:
${companyContext}

Metrics (with changes):
- Burnout: ${meters.burnout} (${deltas.burnout >= 0 ? '+' : ''}${(deltas.burnout ?? 0).toFixed(1)})
- Funding: ${meters.funding} (${deltas.funding >= 0 ? '+' : ''}${(deltas.funding ?? 0).toFixed(1)})
- Ethics: ${meters.ethics} (${deltas.ethics >= 0 ? '+' : ''}${(deltas.ethics ?? 0).toFixed(1)})
- VC mood index (negative = skeptical, positive = impressed): ${vcMood.toFixed(1)}
- Employee morale index (negative = burned out, positive = energized): ${employeeMorale.toFixed(1)}
- Player intent inferred from update: ${lastIntent}

Recent rounds:
${historyContext}

Return this exact JSON format:
{"vc": "VC's comment here", "employee": "Employee's comment here"}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `You write darkly comedic NPC dialogue for a founder burnout simulator. Keep the humor readable for anyone lightly following tech news, and nod to the company context when possible.

VC Character: Transactional venture capitalist. Speaks in clichés like "circle back," "runway," "traction." Enthusiastic only when metrics spike. Dismissive when numbers drop. Maximum 15 words.

Employee Character: Burnt-out but honest. Uses informal language. Supportive when things go well, but blunt about unsustainable pace. Maximum 18 words.

Always reference a concrete detail from the latest update, company context, a meter change, or the recent history. Never break character. Output ONLY the requested JSON format.`,
      prompt,
      0.5
    );
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini NPC response was empty.');
    }
    if (typeof parsed.vc !== 'string' || typeof parsed.employee !== 'string') {
      throw new Error('Gemini NPC response missing dialogue fields.');
    }
    return parsed;
  } catch (error) {
    console.error('Gemini NPC error:', error);
    throw error;
  }
}

export async function generateInsights(gameState, deltas, nlp, updateText, apiKey) {
  const client = await getClient(apiKey);
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(gameState.history);
  
  const prompt = `Advisor briefing for founder update.

Company context:
${companyContext}

Round: ${gameState.round}/${TOTAL_PHASES}
Intent inferred from update: ${nlp.intent || inferIntentFromText(updateText)}
Meters now: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}
Deltas: ${JSON.stringify(deltas)}
NLP: ${JSON.stringify(nlp)}
Update text: "${updateText}"
Recent rounds:
${historyContext}

Return JSON: {"tip": "advisor tip", "headline": "news headline"}`;
  
  try {
    const parsed = await requestJSONResponse(
      client,
      `You are a seasoned startup board advisor and tech journalist rolled into one.

From the exact update text, recent rounds, and the latest meters/deltas, craft:
- A concise, punchy advisor tip (<= 18 words) grounded in the real situation.
- A newsy headline (<= 12 words) that echoes how the outside world would report it.

Every sentence must reference a concrete detail (specific metric movement, quote, company detail, or event) from the inputs above. Keep the satire accessible to outsiders poking fun at Silicon Valley. Output ONLY JSON.`,
      prompt,
      0.4
    );
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini insights response was empty.');
    }
    if (typeof parsed.tip !== 'string' || typeof parsed.headline !== 'string') {
      throw new Error('Gemini insights response missing "tip" or "headline".');
    }
    return { ...parsed, source: 'gemini' };
  } catch (error) {
    console.error('Gemini insight error:', error);
    throw error;
  }
}

export async function generateSceneCard(gameState, deltas, nlp, updateText, narrative, milestoneEvents, apiKey) {
  const client = await getClient(apiKey);
  const milestoneSummary = (milestoneEvents || []).map(evt => `- ${evt.title}: ${evt.summary}`).join('\n') || 'None this round';
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(gameState.history);
  const prompt = `Craft a concise round recap for a startup sim.

Context:
- Company context:\n${companyContext}
- Update text: "${updateText}"
- Intent inferred from text: ${nlp.intent || inferIntentFromText(updateText)}
- Metrics: Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, Funding ${gameState.meters.funding}
- Deltas: ${JSON.stringify(deltas)}
- NLP scores: ${JSON.stringify(nlp)}
- Milestones touched:\n${milestoneSummary}
- Recent rounds:\n${historyContext}

Return JSON: {"title": "short title", "narrative": "2 short sentences", "hook": "one recommendation"}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Craft vivid but concise recap cards for a founder burnout simulator. Reference explicit facts from the latest update, milestone summary, company context, or recent history. Keep the satire readable for general audiences. Output STRICT JSON.`,
      prompt,
      0.5
    );
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini scene card response was empty.');
    }
    const { title, narrative: body, hook } = parsed;
    if (typeof title !== 'string' || typeof body !== 'string' || typeof hook !== 'string') {
      throw new Error('Gemini scene card response missing required fields.');
    }
    return { title, narrative: body, hook, source: 'gemini' };
  } catch (error) {
    console.error('Gemini scene card error:', error);
    throw error;
  }
}

export async function generateMilestoneNarratives(gameState, narrative, changes, deltas, nlp, updateText, apiKey) {
  const client = await getClient(apiKey);
  if (!changes || !changes.length) return [];

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
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(gameState.history);

  const prompt = `Milestone progress update.

Company context:
${companyContext}

Update text: "${updateText}"
Intent inferred: ${nlp.intent || inferIntentFromText(updateText)}
Metric deltas: ${JSON.stringify(deltas)}
Milestones needing new copy: ${JSON.stringify(changeSummary)}
Recent rounds:\n${historyContext}

Return JSON array like:
[{"id":"product","summary":"New status line","hook":"Next step nudge","progressLabel":"Stage name"}]`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Write one-sentence milestone summaries for a founder burnout sim. Anchor each summary/hook to concrete signals from the latest update, metric deltas, company context, or recent rounds. Keep the wit approachable for non-insiders. Output ONLY JSON arrays.`,
      prompt,
      0.4
    );
    if (!Array.isArray(parsed)) {
      throw new Error('Gemini milestone response must be an array.');
    }
    return parsed.map(item => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        typeof item.summary !== 'string'
      ) {
        throw new Error('Gemini milestone entry missing required fields.');
      }
      return {
        id: item.id,
        summary: item.summary,
        hook: typeof item.hook === 'string' ? item.hook : null,
        progressLabel: typeof item.progressLabel === 'string' ? item.progressLabel : null,
        highlight: typeof item.highlight === 'string' ? item.highlight : item.hook || null,
        source: 'gemini'
      };
    });
  } catch (error) {
    console.error('Gemini milestone error:', error);
    throw error;
  }
}

export async function generatePostMortem(history, finalState, ending, apiKey, gameState = {}) {
  const client = await getClient(apiKey);
  const companyContext = buildCompanyContext(gameState);
  const historyContext = formatHistoryContext(history);
  const prompt = `Write a dryly witty investor-style post-mortem for a founder burnout sim run.

Company context:
${companyContext}

Ending reached: ${ending.title}
Ending narrative: ${ending.text}
Final meters: ${JSON.stringify(finalState.meters)}
Rounds of history: ${history.length}
Recent rounds summary:\n${historyContext}

Return JSON: {"memo": "short paragraph"}`;

  try {
    const parsed = await requestJSONResponse(
      client,
      `Write dryly witty investor-style post-mortems for a founder burnout simulator. Reference the company context and recent rounds while keeping the satire understandable to outsiders. Output ONLY JSON objects.`,
      prompt,
      0.35
    );
    if (typeof parsed !== 'object' || typeof parsed?.memo !== 'string') {
      throw new Error('Gemini post-mortem response missing "memo".');
    }
    return parsed.memo;
  } catch (error) {
    console.error('Gemini post-mortem error:', error);
    throw error;
  }
}
