const MILESTONE_DEFINITIONS = {
  product: {
    title: 'Ship V1',
    stages: [
      { label: 'Concept', status: 'Sketching the vision' },
      { label: 'Prototype', status: 'Alpha build limping through demos' },
      { label: 'Launch', status: 'Public launch riding a spike of signups' },
      { label: 'Scale', status: 'Feature velocity humming, users sticking around' }
    ]
  },
  funding: {
    title: 'Secure Series A',
    stages: [
      { label: 'Door knocking', status: 'Warm intros and cold emails galore' },
      { label: 'Term sheet whispers', status: 'VCs nibbling on traction charts' },
      { label: 'Diligence gauntlet', status: 'Data room open, partner meeting scheduled' },
      { label: 'Money in the bank', status: 'Wire hit, runway reset, new board member incoming' }
    ]
  },
  team: {
    title: 'Keep Team Together',
    stages: [
      { label: 'Hopeful', status: 'Everyone thinks this might actually work' },
      { label: 'Grinding', status: 'Late nights + code red weekends take a toll' },
      { label: 'Stabilizing', status: 'Process, boundaries, and better sleep regain trust' },
      { label: 'Thriving', status: 'Team humming, celebrating wins without burnout' }
    ]
  }
};

function createDefaultNarrative() {
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

let gameState = {
  round: 1,
  company: { name: "", founder: "", industry: "AI SaaS", tech: "Cloud Platform" },
  traits: [],
  meters: { ethics: 60, burnout: 25, funding: 50 },
  history: [],
  narrative: createDefaultNarrative()
};

let detailsCollapsed = false;
let previousMeters = { ...gameState.meters };
let reactionOverlay = null;
let audioCtx = null;
const PHASE_TITLES = [
  'Stage 1: Garage Sparks',
  'Stage 2: Beta Or Bust',
  'Stage 3: Demo Day Scramble',
  'Stage 4: Investor Reckoning',
  'Stage 5: Viral Mirage',
  'Stage 6: Compliance Curveball',
  'Stage 7: Hiring Freeze',
  'Stage 8: Board Ultimatum',
  'Stage 9: Burnout Line',
  'Stage 10: Final Ledger'
];
const TOTAL_PHASES = PHASE_TITLES.length;
const API_BASE_URL = 'http://localhost:3000';

const STAT_CONFIG = {
  ethics: { fillId: 'ethics-fill', valueId: 'ethics-val', statId: 'stat-ethics', positiveMetric: true },
  burnout: { fillId: 'burnout-fill', valueId: 'burnout-val', statId: 'stat-burnout', positiveMetric: false },
  funding: { fillId: 'funding-fill', valueId: 'funding-val', statId: 'stat-funding', positiveMetric: true }
};
const TRAIT_CLASS_MAP = {
  Ambition: 'ambition',
  Integrity: 'integrity',
  Charisma: 'charisma',
  Resilience: 'resilience'
};

function resetProfileCard() {
  const founderEl = document.getElementById('profileFounder');
  if (founderEl) founderEl.textContent = '—';
  const companyEl = document.getElementById('profileCompany');
  if (companyEl) companyEl.textContent = '—';
  const traitsEl = document.getElementById('profileTraits');
  if (traitsEl) {
    traitsEl.innerHTML = '<span class="trait-pill muted">Traits pending</span>';
  }
  ['Ethics', 'Funding', 'Burnout'].forEach(label => {
    setMiniMeter(`profile${label}Fill`, `profile${label}Value`, 0);
  });
}

function updateProfileMeta() {
  const founderName = gameState.company.founder || '—';
  const founderEl = document.getElementById('profileFounder');
  if (founderEl) founderEl.textContent = founderName || '—';
  const companyEl = document.getElementById('profileCompany');
  if (companyEl) {
    const industry = gameState.company.industry || '—';
    const tech = gameState.company.tech || '—';
    companyEl.textContent = `${industry} • ${tech}`;
  }
  const traitsEl = document.getElementById('profileTraits');
  if (traitsEl) {
    if (Array.isArray(gameState.traits) && gameState.traits.length) {
      traitsEl.innerHTML = gameState.traits
        .map(trait => {
          const cls = TRAIT_CLASS_MAP[trait] || 'muted';
          return `<span class="trait-pill ${cls}">${trait}</span>`;
        })
        .join('');
    } else {
      traitsEl.innerHTML = '<span class="trait-pill muted">Traits pending</span>';
    }
  }
}

function updateProfileMeters() {
  setMiniMeter('profileEthicsFill', 'profileEthicsValue', gameState.meters.ethics);
  setMiniMeter('profileFundingFill', 'profileFundingValue', gameState.meters.funding);
  setMiniMeter('profileBurnoutFill', 'profileBurnoutValue', gameState.meters.burnout);
}

function setMiniMeter(fillId, valueId, value) {
  const fillEl = document.getElementById(fillId);
  if (fillEl) {
    const safeValue = clampValue(Number(value) || 0, 0, 100);
    fillEl.style.width = `${safeValue}%`;
  }
  const valueEl = document.getElementById(valueId);
  if (valueEl) {
    valueEl.textContent = Math.round(Number(value) || 0);
  }
}

resetProfileCard();

// Setup screen logic
document.getElementById('startGame').addEventListener('click', () => {
  const name = document.getElementById('companyName').value.trim() || 'StartupCo';
  const founderInput = document.getElementById('founderName');
  const founder = founderInput ? founderInput.value.trim() : '';
  const industry = document.getElementById('industry').value;
  const tech = document.getElementById('tech').value;
  const traitBoxes = document.querySelectorAll('#traits input[type="checkbox"]:checked');
  const traits = Array.from(traitBoxes).map(cb => cb.value);
  
  if (traits.length !== 2) {
    alert('Please select exactly 2 traits!');
    return;
  }
  
  gameState.company = { name, founder, industry, tech };
  gameState.traits = traits;
  updateRoundDisplay(1);
  updatePhaseTitle(PHASE_TITLES[0]);
  updateProfileMeta();
  updateProfileMeters();
  
  const label = founder ? `${name} • Founder ${founder}` : name;
  document.getElementById('companyDisplay').textContent = label;
  const companyMetaEl = document.getElementById('companyMeta');
  if (companyMetaEl) {
    companyMetaEl.textContent = `${industry} • ${tech}`;
  }
  
  showScreen('game');
  loadInitialScene();
});

document.querySelectorAll('.setup-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    document.querySelectorAll('.setup-tab').forEach(btn => btn.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.setup-panel').forEach(panel => {
      if (panel.id === target) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
  });
});

// Game screen logic
const updateTextArea = document.getElementById('updateText');
const charCountSpan = document.getElementById('charCount');
const companyMetaEl = document.getElementById('companyMeta');
if (companyMetaEl) {
  companyMetaEl.textContent = '';
}
const companyDisplayEl = document.getElementById('companyDisplay');
if (companyDisplayEl && !companyDisplayEl.textContent) {
  companyDisplayEl.textContent = '—';
}

updateTextArea.addEventListener('input', () => {
  charCountSpan.textContent = updateTextArea.value.length;
});

updateAdvisorInsights(null, null);
resetRoundSummary();
updateBackground(gameState.meters.burnout);
updateProgress(gameState.round);

const detailsContainer = document.getElementById('analysisDetails');
const roundTotalEl = document.getElementById('roundTotal');
if (roundTotalEl) {
  roundTotalEl.textContent = TOTAL_PHASES;
}
const phaseTitleEl = document.getElementById('phaseTitle');
if (phaseTitleEl) {
  phaseTitleEl.textContent = PHASE_TITLES[0];
}

document.getElementById('submitRound').addEventListener('click', async () => {
  const text = updateTextArea.value.trim();
  
  if (!text) {
    alert('Write an update first!');
    return;
  }
  
  // Disable submit button and show loading
  const submitBtn = document.getElementById('submitRound');
  const loadingMsg = document.getElementById('loadingMessage');
  submitBtn.disabled = true;
  loadingMsg.classList.add('active');
  
  try {
    const result = await processRound(text);
    ensureServerResult(result);
    console.info('Analysis source:', result.analysisSource);
    
    // Update game state
    gameState = result.newState;
    if (result.narrative) {
      gameState.narrative = result.narrative;
    } else if (!gameState.narrative) {
      gameState.narrative = createDefaultNarrative();
    }
    gameState.history.push({
      round: gameState.round - 1,
      text,
      ...result.nlp,
      analysisSource: result.analysisSource,
      insights: result.insights,
      insightsSource: result.insightsSource,
      sceneCard: result.sceneCard,
      milestoneEvents: result.milestoneEvents,
      meters: { ...result.newState.meters }
    });
    
    // Update UI
    updateMeters(result.newState.meters);
    updateExplainability(result.nlp, result.analysisSource);
    updateAdvisorInsights(result.insights, result.insightsSource);
    updateRoundSummary(result);
    updateNPCs(result.npcLines);
    updatePhaseTitle(result.phaseTitle);
    updateRoundDisplay(result.newState.round);
    const reactionMessage = (result.sceneCard && (result.sceneCard.hook || result.sceneCard.narrative))
      || result.intentSummary
      || (result.insights && result.insights.tip)
      || 'Week resolved.';
    const reactionType = determineReactionType(result.deltas);
    showReaction(reactionMessage, reactionType);
    
    // Clear text area
    updateTextArea.value = '';
    charCountSpan.textContent = '0';
    
    // Check for ending
    if (result.ending) {
      setTimeout(() => showEnding(result.ending, result.newState.meters, result.postMortem), 1000);
    }
    
  } catch (error) {
    console.error('Error processing round:', error);
    alert('Failed to process round. Check console and try again.');
  } finally {
    submitBtn.disabled = false;
    loadingMsg.classList.remove('active');
  }
});

async function processRound(text) {
  return requestServerRound(text);
}

async function requestServerRound(text) {
  const response = await fetch(`${API_BASE_URL}/api/process-round`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, gameState })
  });
  
  if (!response.ok) {
    const message = `Server error (${response.status})`;
    throw new Error(message);
  }
  
  const result = await response.json();
  
  if (result && result.error) {
    throw new Error(result.error);
  }
  
  if (!result.analysisSource && result.nlp && result.nlp.source) {
    result.analysisSource = result.nlp.source;
  }
  
  return result;
}

async function loadInitialScene() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/intro-scene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameState })
    });
    if (!response.ok) {
      throw new Error(`Intro scene failed (${response.status})`);
    }
    const data = await response.json();
    applyIntroScene(data);
  } catch (error) {
    console.error('Failed to load intro scene:', error);
  }
}

function applyIntroScene(data) {
  if (!data) return;
  updateRoundSummary({
    sceneCard: data.sceneCard,
    nlp: data.nlp || {},
    milestoneEvents: [],
    deltas: data.deltas || {},
    insights: data.insights,
    intentSummary: data.intentSummary
  });
  if (data.npcLines) {
    updateNPCs(data.npcLines);
  }
  if (data.insights) {
    updateAdvisorInsights(data.insights, data.insights.source);
  }
  if (data.nlp) {
    updateExplainability(data.nlp, data.nlp.source);
  }
}

function clampValue(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function ensureServerResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Server returned an empty response.');
  }
  if (!result.newState || typeof result.newState !== 'object') {
    throw new Error('Server response missing new game state.');
  }
  if (!result.nlp || typeof result.nlp !== 'object') {
    throw new Error('Server response missing NLP analysis.');
  }
  if (!result.sceneCard || typeof result.sceneCard !== 'object') {
    throw new Error('Server response missing scene card data.');
  }
  if (!result.insights || typeof result.insights !== 'object') {
    throw new Error('Server response missing advisor insights.');
  }
  if (!result.npcLines || typeof result.npcLines !== 'object') {
    throw new Error('Server response missing NPC dialogue.');
  }
  if (typeof result.npcLines.vc !== 'string' || typeof result.npcLines.employee !== 'string') {
    throw new Error('Server NPC dialogue response malformed.');
  }
}

function updateStat(key, value) {
  const config = STAT_CONFIG[key];
  if (!config) return 0;
  const fillEl = document.getElementById(config.fillId);
  const valueEl = document.getElementById(config.valueId);
  const statEl = document.getElementById(config.statId);
  const newValue = clampValue(Number(value) || 0, 0, 100);
  const previous = previousMeters[key] ?? newValue;
  previousMeters[key] = newValue;
  if (valueEl) {
    valueEl.textContent = Math.round(newValue);
  }
  if (fillEl) {
    requestAnimationFrame(() => {
      fillEl.style.width = `${newValue}%`;
    });
  }
  const delta = newValue - previous;
  if (statEl && Math.abs(delta) >= 1) {
    statEl.classList.remove('pulse-positive', 'pulse-negative');
    const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
    const className = positiveChange ? 'pulse-positive' : 'pulse-negative';
    statEl.classList.add(className);
    setTimeout(() => statEl.classList.remove(className), 550);
  }
  if (fillEl) {
    fillEl.classList.remove('glow-positive', 'glow-negative');
    if (Math.abs(delta) >= 2) {
      const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
      const glowClass = positiveChange ? 'glow-positive' : 'glow-negative';
      fillEl.classList.add(glowClass);
      setTimeout(() => fillEl.classList.remove(glowClass), 500);
    }
  }
  if (Math.abs(delta) >= 8) {
    const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
    playTone(positiveChange ? 'success' : 'fail');
  } else if (Math.abs(delta) >= 4) {
    playTone('warning');
  }
  gameState.meters[key] = newValue;
  if (key === 'burnout') {
    updateBackground(newValue);
  }
  return delta;
}

function updateMeters(meters) {
  Object.keys(STAT_CONFIG).forEach(statKey => {
    if (typeof meters[statKey] === 'number') {
      updateStat(statKey, meters[statKey]);
    }
  });
  updateProfileMeters();
}

function updateExplainability(nlp = {}, source) {
  const sentiment = typeof nlp.sentiment === 'number' ? Math.round(nlp.sentiment) : '—';
  const buzzword = typeof nlp.buzzword === 'number' ? Math.round(nlp.buzzword) : '—';
  const feasibility = typeof nlp.feasibility === 'number' ? Math.round(nlp.feasibility) : '—';
  document.getElementById('sentiment').textContent = sentiment;
  document.getElementById('buzzword').textContent = buzzword;
  document.getElementById('feasibility').textContent = feasibility;
  const sourceLabel = document.getElementById('analysisSource');
  if (sourceLabel) {
    const labelMap = {
      gemini: 'Gemini API',
      google: 'Gemini API',
      openai: 'ChatGPT API',
      heuristic: 'Fallback heuristic',
      offline: 'Offline simulator',
      local: 'Offline simulator'
    };
    const normalized = typeof source === 'string' ? source.toLowerCase() : 'unknown';
    sourceLabel.textContent = labelMap[normalized] || (source || nlp.source || 'unknown');
  }
}

function updateAdvisorInsights(insights, source) {
  const tipEl = document.getElementById('advisorTip');
  const headlineEl = document.getElementById('worldHeadline');
  const sourceEl = document.getElementById('insightsSource');
  const labelMap = {
    gemini: 'Gemini API',
    google: 'Gemini API',
    openai: 'ChatGPT API',
    heuristic: 'Fallback heuristic',
    offline: 'Offline simulator',
    local: 'Offline simulator'
  };
  if (!insights) {
    if (tipEl) tipEl.textContent = '—';
    if (headlineEl) headlineEl.textContent = '—';
    if (sourceEl) sourceEl.textContent = '—';
    return;
  }
  if (tipEl) tipEl.textContent = insights.tip || '—';
  if (headlineEl) headlineEl.textContent = insights.headline || '—';
  if (sourceEl) {
    const normalized = typeof source === 'string' ? source.toLowerCase() : (insights.source || 'unknown');
    sourceEl.textContent = labelMap[normalized] || (source || insights.source || 'unknown');
  }
}

function ensureReactionOverlay() {
  if (reactionOverlay) return reactionOverlay;
  reactionOverlay = document.createElement('div');
  reactionOverlay.className = 'reaction-overlay';
  document.body.appendChild(reactionOverlay);
  return reactionOverlay;
}

function showReaction(text, type = 'warning') {
  if (!text) return;
  const overlay = ensureReactionOverlay();
  const message = document.createElement('div');
  message.className = `reaction-message reaction-${type}`;
  message.textContent = text;
  overlay.appendChild(message);
  setTimeout(() => {
    message.remove();
  }, 2100);
}

function playTone(type) {
  const duration = 0.25;
  const frequencies = {
    success: 620,
    warning: 420,
    fail: 250
  };
  const freq = frequencies[type] || frequencies.warning;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.value = 0.12;
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

function updateBackground(burnout) {
  const intensity = clampValue(burnout, 0, 100) / 100;
  const startR = Math.round(10 + intensity * 120);
  const startG = Math.round(10 + intensity * 35);
  const startB = Math.round(20 + intensity * 15);
  document.body.style.background = `radial-gradient(circle at top left, rgba(${startR}, ${startG}, ${startB}, 1), rgba(5,5,7,1) 65%)`;
}

function updateProgress(round) {
  const fill = document.getElementById('progress-fill');
  if (!fill) return;
  const ratio = clampValue(round, 0, TOTAL_PHASES) / TOTAL_PHASES;
  fill.style.width = `${ratio * 100}%`;
}

function determineReactionType(deltas = {}) {
  let strongestKey = null;
  let strongestMagnitude = -Infinity;
  Object.entries(deltas).forEach(([key, value]) => {
    if (typeof value !== 'number') return;
    const magnitude = Math.abs(value);
    if (magnitude > strongestMagnitude) {
      strongestMagnitude = magnitude;
      strongestKey = key;
    }
  });
  if (!strongestKey || strongestMagnitude < 3) return 'warning';
  const config = STAT_CONFIG[strongestKey];
  if (!config) return 'warning';
  const delta = deltas[strongestKey];
  const positive = config.positiveMetric ? delta >= 0 : delta < 0;
  return positive ? 'success' : 'fail';
}

function displayStory(sceneCard, intentSummary, milestoneEvents) {
  const storyEl = document.getElementById('story');
  if (!storyEl) return;
  const base = (sceneCard && (sceneCard.narrative || sceneCard.description)) || intentSummary || '';
  const milestoneLine = milestoneEvents && milestoneEvents.length ? ` ${milestoneEvents[0].summary || ''}` : '';
  const text = (base + milestoneLine).trim();
  storyEl.textContent = text;
  storyEl.classList.remove('visible');
  void storyEl.offsetWidth;
  if (text) {
    storyEl.classList.add('visible');
  }
}

function resetRoundSummary() {
  const headlineEl = document.getElementById('summaryHeadline');
  const ctaEl = document.getElementById('summaryCTA');
  const highlightEl = document.getElementById('summaryHighlight');
  if (headlineEl) headlineEl.textContent = 'Submit your first update to see how the world reacts.';
  if (ctaEl) ctaEl.textContent = 'Keep burnout low without tanking funding or ethics.';
  if (highlightEl) {
    highlightEl.textContent = '';
    highlightEl.style.display = 'none';
  }
  const storyEl = document.getElementById('story');
  if (storyEl) {
    storyEl.textContent = '';
    storyEl.classList.remove('visible');
  }
}

function updateRoundSummary(result) {
  const headlineEl = document.getElementById('summaryHeadline');
  const ctaEl = document.getElementById('summaryCTA');
  const highlightEl = document.getElementById('summaryHighlight');
  if (!headlineEl || !ctaEl || !highlightEl) return;
  const scene = result.sceneCard || result.nlp?.scenario || {};
  const milestoneEvent = Array.isArray(result.milestoneEvents) && result.milestoneEvents.length
    ? result.milestoneEvents[0]
    : null;
  const insightHeadline = result.insights?.headline || 'Mixed signals from the front lines.';
  const insightCTA = result.insights?.tip || 'Keep iterating toward balance before the board panics.';
  headlineEl.textContent = scene.title || milestoneEvent?.title || insightHeadline;
  ctaEl.textContent = scene.narrative || scene.body || milestoneEvent?.summary || insightCTA;
  const deltas = result.deltas || {};
  let highlightText = scene.hook || milestoneEvent?.hook || milestoneEvent?.highlight;
  if (!highlightText) {
    let strongest = null;
    Object.entries(deltas).forEach(([key, value]) => {
      if (typeof value !== 'number') return;
      const magnitude = Math.abs(value);
      if (!strongest || magnitude > strongest.magnitude) {
        strongest = { key, value, magnitude };
      }
    });
    const labelMap = {
      ethics: 'Ethics',
      burnout: 'Burnout',
      funding: 'Funding'
    };
    if (strongest && strongest.magnitude >= 4) {
      const emoji = strongest.value >= 0 ? '⬆️' : '⬇️';
      const label = labelMap[strongest.key] || strongest.key;
      highlightText = `${emoji} ${label} ${strongest.value > 0 ? '+' : ''}${Math.round(strongest.value)}`;
    }
  }
  if (highlightText) {
    highlightEl.textContent = highlightText;
    highlightEl.style.display = 'inline-block';
  } else {
    highlightEl.textContent = '';
    highlightEl.style.display = 'none';
  }
  displayStory(scene, result.intentSummary, result.milestoneEvents || (milestoneEvent ? [milestoneEvent] : []));
}

function updateNPCs(npcLines) {
  document.getElementById('vc-line').textContent = `"${npcLines.vc}"`;
  document.getElementById('emp-line').textContent = `"${npcLines.employee}"`;
}

function updatePhaseTitle(title) {
  document.getElementById('phaseTitle').textContent = title;
}

function updateRoundDisplay(round) {
  const displayRound = Math.min(round, TOTAL_PHASES);
  document.getElementById('roundDisplay').textContent = displayRound;
  updateProgress(displayRound);
}

function showEnding(ending, finalMeters, postMortem) {
  document.getElementById('endingTitle').textContent = ending.title;
  document.getElementById('endingText').textContent = ending.text;
  const postEl = document.getElementById('endingPostMortem');
  if (postEl) {
    if (postMortem) {
      postEl.textContent = postMortem;
      postEl.style.display = 'block';
    } else {
      postEl.textContent = '';
      postEl.style.display = 'none';
    }
  }
  
  const finalStats = document.getElementById('finalStats');
  finalStats.innerHTML = `
    <div><strong>${Math.round(finalMeters.ethics)}</strong><span>Ethics</span></div>
    <div><strong>${Math.round(finalMeters.burnout)}</strong><span>Burnout</span></div>
    <div><strong>${Math.round(finalMeters.funding)}</strong><span>Funding</span></div>
  `;
  
  showScreen('ending');
}

document.getElementById('restart').addEventListener('click', () => {
  gameState = {
    round: 1,
    company: { name: "", founder: "", industry: "AI SaaS", tech: "Cloud Platform" },
    traits: [],
    meters: { ethics: 60, burnout: 25, funding: 50 },
    history: [],
    narrative: createDefaultNarrative()
  };
  previousMeters = { ...gameState.meters };
  
  updateMeters(gameState.meters);
  updateRoundDisplay(1);
  updatePhaseTitle(PHASE_TITLES[0]);
  document.getElementById('sentiment').textContent = '—';
  document.getElementById('buzzword').textContent = '—';
  document.getElementById('feasibility').textContent = '—';
  const sourceLabel = document.getElementById('analysisSource');
  if (sourceLabel) {
    sourceLabel.textContent = '—';
  }
  updateAdvisorInsights(null, null);
  resetRoundSummary();
  document.getElementById('companyDisplay').textContent = '—';
  const companyMetaEl = document.getElementById('companyMeta');
  if (companyMetaEl) {
    companyMetaEl.textContent = '';
  }
  resetProfileCard();
  document.getElementById('vc-line').textContent = '"Waiting for your first update..."';
  document.getElementById('emp-line').textContent = '"Let\'s ship something."';
  
  showScreen('setup');
});

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}
