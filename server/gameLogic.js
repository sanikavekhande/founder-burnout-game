export const PHASE_TITLES = [
  'Month 1: Garage Sparks',
  'Month 2: Beta Or Bust',
  'Month 3: Demo Day Scramble',
  'Month 4: Investor Reckoning',
  'Month 5: Viral Mirage',
  'Month 6: Compliance Curveball',
  'Month 7: Hiring Freeze',
  'Month 8: Board Ultimatum',
  'Month 9: Burnout Line',
  'Month 10: Final Ledger'
];
export const TOTAL_PHASES = PHASE_TITLES.length;

const DEFAULT_METERS = ['burnout', 'funding', 'ethics'];

export function getPhaseTitle(round) {
  return PHASE_TITLES[Math.min(round - 1, PHASE_TITLES.length - 1)];
}

function clampValue(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function inferIntent(updateText = '', nlp = {}) {
  if (nlp.intent) return nlp.intent;
  const lower = updateText.toLowerCase();
  if (/(fundraise|investor|vc|angel|pitch|term sheet|runway)/.test(lower)) return 'funding';
  if (/(burnout|rest|mental|therapy|sleep|offsite|retreat|hiring|hire)/.test(lower)) return 'rest';
  if (/(ethic|governance|compliance|privacy|regulator|safety|trust)/.test(lower)) return 'ethics';
  if (/(outage|crash|fire|leak|lawsuit|crisis)/.test(lower)) return 'crisis';
  if (/(ship|launch|feature|deployment|build|sprint)/.test(lower)) return 'build';
  return 'default';
}

export function computeDeltas(nlp, updateText, gameState) {
  const { traits, company } = gameState;
  const {
    productivityImpact = 50,
    moodSignal = 50,
    eventRelevance = 50,
    traitFit = {}
  } = nlp || {};
  const intent = inferIntent(updateText, nlp);
  const deltas = { burnout: 0, funding: 0, ethics: 0 };

  if (nlp?.meterDeltas) {
    DEFAULT_METERS.forEach(key => {
      if (typeof nlp.meterDeltas[key] === 'number') {
        deltas[key] += nlp.meterDeltas[key];
      }
    });
  } else {
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
  }

  if (/\btransparen|audit|report\b/i.test(updateText)) deltas.ethics += 5;
  if (/\bhire|hiring|team\b/i.test(updateText)) deltas.burnout -= 5;

  const industryMods = getIndustryModifiers(company.industry);
  const techMods = getTechModifiers(company.tech);
  if (deltas.ethics < 0) deltas.ethics *= industryMods.ethics_risk * techMods.ethics_risk;
  if (deltas.funding > 0) deltas.funding *= industryMods.funding * techMods.funding;
  deltas.burnout *= industryMods.burnout * techMods.burnout;

  if (traits.includes('Integrity') && deltas.ethics < 0) {
    deltas.ethics *= 0.6;
  }
  if (traits.includes('Resilience')) {
    deltas.burnout -= 4;
  }
  if (traits.includes('Ambition')) {
    deltas.burnout += 2;
    deltas.funding += 1;
  }
  if (traits.includes('Charisma') && intent === 'funding') {
    deltas.funding += 4;
  }

  const selectedTraitScores = Array.isArray(traits)
    ? traits
        .map(trait => (typeof traitFit[trait] === 'number' ? traitFit[trait] : 50))
        .filter(score => typeof score === 'number')
    : [];
  const traitAvg = selectedTraitScores.length
    ? selectedTraitScores.reduce((sum, score) => sum + score, 0) / selectedTraitScores.length
    : 50;

  const eventAvg = (productivityImpact + moodSignal + eventRelevance) / 3;
  let eventMultiplier = 1;
  if (eventAvg >= 65) {
    eventMultiplier = 0.9;
  } else if (eventAvg <= 35) {
    eventMultiplier = 1.2;
  }

  function applyTraitModifier(value) {
    if (typeof value !== 'number') return value;
    if (!selectedTraitScores.length) return value;
    if (traitAvg >= 70) {
      return value >= 0 ? value * 1.1 : value * 0.8;
    }
    if (traitAvg <= 30) {
      return value >= 0 ? value * 0.9 : value * 1.3;
    }
    return value;
  }

  DEFAULT_METERS.forEach(key => {
    if (typeof deltas[key] === 'number') {
      deltas[key] = applyTraitModifier(deltas[key]) * eventMultiplier;
    }
  });

  const severity = Math.max(
    Math.abs(productivityImpact - 50),
    Math.abs(moodSignal - 50),
    Math.abs(eventRelevance - 50)
  );
  let multiplier = 1;
  if (severity >= 35) {
    multiplier = 2;
  } else if (severity >= 25) {
    multiplier = 1.5;
  } else if (severity < 10) {
    multiplier = 0.8;
  }
  DEFAULT_METERS.forEach(key => {
    if (typeof deltas[key] === 'number') {
      deltas[key] *= multiplier;
    }
  });

  DEFAULT_METERS.forEach(key => {
    deltas[key] = Number(deltas[key] || 0);
  });
  return deltas;
}

export function applyDeltas(deltas, gameState) {
  const newMeters = { ...gameState.meters };
  DEFAULT_METERS.forEach(key => {
    const current = typeof newMeters[key] === 'number' ? newMeters[key] : 50;
    const delta = typeof deltas[key] === 'number' ? deltas[key] : 0;
    newMeters[key] = clampValue(current + delta);
  });
  return newMeters;
}

export function checkEnding(meters, round) {
  const { ethics, burnout, funding } = meters;
  if (burnout > 85) {
    return {
      title: 'Collapse',
      text: 'You burnt out. Your co-founder took over while you checked into a wellness retreat in Bali. The company pivoted to selling NFTs.'
    };
  }
  if (funding < 5) {
    return {
      title: 'Bankruptcy',
      text: 'You ran out of runway. Your last Slack message was "brb" three months ago. The domain expired.'
    };
  }
  if (ethics < 15) {
    return {
      title: 'Scandal',
      text: 'Regulators and Reddit teamed up. Your apology thread has 4k comments and zero mercy.'
    };
  }
  if (round < TOTAL_PHASES) return null;

  if (funding > 80 && ethics > 55 && burnout < 40) {
    return {
      title: 'Steady Runway',
      text: 'You dialed in a humane, well-funded machine. LPs brag about backing you early.'
    };
  }
  if (funding > 85 && ethics < 35) {
    return {
      title: 'Shady Exit',
      text: 'A mega-corp acquired you before the lawsuits landed. Your yacht is named "Materially False."'
    };
  }
  if (ethics > 80 && burnout < 35 && funding > 45) {
    return {
      title: 'Conscious Company',
      text: 'You built a business people respect and actually want to work at. Wild concept.'
    };
  }
  if (burnout > 65 && funding > 70) {
    return {
      title: 'Zombie Unicorn',
      text: 'Money kept arriving but everyone is dead behind the eyes. Enjoy the golden handcuffs.'
    };
  }
  return {
    title: 'Stable Mediocrity',
    text: 'You built a sustainable business. 20 employees, $3M ARR, no headlines. Your parents still ask when you\'ll get a "real job."'
  };
}

function getIndustryModifiers(industry) {
  const mods = {
    'AI SaaS': { ethics_risk: 1.2, funding: 1.1, burnout: 1.05 },
    'Climate Tech': { ethics_risk: 0.85, funding: 0.95, burnout: 1.1 },
    'Fintech Infrastructure': { ethics_risk: 1.15, funding: 1.2, burnout: 1.05 },
    'Health Tech': { ethics_risk: 0.75, funding: 0.9, burnout: 0.95 },
    'Consumer Social': { ethics_risk: 1.0, funding: 1.05, burnout: 1.15 },
    'Robotics & Defense': { ethics_risk: 0.95, funding: 1.0, burnout: 1.1 }
  };
  return mods[industry] || mods['AI SaaS'];
}

function getTechModifiers(tech) {
  const mods = {
    'Cloud Platform': { ethics_risk: 1.0, funding: 1.0, burnout: 1.0 },
    'AI Agents': { ethics_risk: 1.25, funding: 1.08, burnout: 1.1 },
    'Robotics Hardware': { ethics_risk: 0.95, funding: 0.92, burnout: 1.12 },
    'Bio/Med': { ethics_risk: 0.8, funding: 0.9, burnout: 0.98 },
    'Marketplace Network': { ethics_risk: 1.05, funding: 1.05, burnout: 1.08 }
  };
  return mods[tech] || mods['Cloud Platform'];
}
