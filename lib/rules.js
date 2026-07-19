/**
 * lib/rules.js — PulsePoint deterministic rules engine
 *
 * Pure, dependency-free module. Every function here is auditable and testable
 * without a network, a browser, or an AI model.
 *
 * Consumed in two ways:
 *   - Browser : <script src="/lib/rules.js"> — the module.exports guard at the
 *               bottom makes it safe to load directly in a browser <script> tag.
 *   - Node.js : require('./lib/rules') in tests and server-side utilities.
 *
 * DO NOT import anything here. Keep this file dependency-free.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Zone / crowd risk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wet-weather WMO codes that indicate precipitation.
 * Kept here so the isWet derivation in api/weather.js can reference the same
 * list (paste-in acceptable since that file runs server-side with no bundler).
 */
const WET_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];

/**
 * Wet weather pushes fans toward covered concourses, raising effective
 * congestion. The 8-point penalty is the fixed operational assumption.
 */
const WET_PENALTY = 8;

/**
 * Classify a zone's crowd risk.
 *
 * @param {number} pct     Raw capacity percentage (0–100).
 * @param {object|null} weather  Weather object with an `isWet` boolean,
 *                               or null/undefined if weather is unknown.
 * @returns {{ level: 'high'|'medium'|'low', action: 'redirect'|'monitor'|'normal', adjusted: number }}
 */
function classifyZoneRisk(pct, weather) {
  // Coerce non-numeric or NaN inputs to 0 so tests can probe bad inputs safely.
  const raw = (typeof pct === 'number' && !isNaN(pct)) ? pct : 0;
  const wetPenalty = (weather && weather.isWet === true) ? WET_PENALTY : 0;
  const adjusted = Math.min(100, Math.max(0, raw + wetPenalty)); // clamp [0,100]

  if (adjusted >= 80) return { level: 'high',   action: 'redirect', adjusted };
  if (adjusted >= 55) return { level: 'medium',  action: 'monitor',  adjusted };
  return                     { level: 'low',    action: 'normal',   adjusted };
}

/**
 * Derive the CSS class from a risk level.
 * Single source of truth — index.html's levelClass() delegates here.
 *
 * @param {'high'|'medium'|'low'} level
 * @returns {'z-high'|'z-med'|'z-low'}
 */
function levelClass(level) {
  if (level === 'high')   return 'z-high';
  if (level === 'medium') return 'z-med';
  return 'z-low';
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident protocols
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed response steps per severity level. The AI's job is ONLY to reword
 * these steps for the specific incident — it cannot add, remove, or reorder.
 */
const INCIDENT_PROTOCOLS = {
  high: [
    'Dispatch nearest 2-person response team immediately',
    'Notify shift supervisor and command center',
    'Escalate to venue operations if unresolved in 5 min',
  ],
  med: [
    'Dispatch nearest available volunteer',
    'Log incident in shift tracker',
    'Follow up within 10 min',
  ],
  low: [
    'Note in shift log',
    'Monitor, no immediate dispatch required',
  ],
};

/**
 * Return the fixed protocol steps for a given severity.
 * Falls back to 'med' for unknown/invalid severity so the UI never crashes.
 *
 * @param {string} severity  'high' | 'med' | 'low'
 * @returns {string[]}
 */
function getIncidentProtocol(severity) {
  if (typeof severity !== 'string') return INCIDENT_PROTOCOLS.med;
  return INCIDENT_PROTOCOLS[severity] || INCIDENT_PROTOCOLS.med;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carbon / transport tiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed relative carbon-impact tiers. Rough but defensible ordering — not
 * AI-invented. The AI's job is to contextualise the tier against weather.
 */
const CARBON_TIER = {
  'Rideshare':       'medium-high (single-occupancy trip)',
  'Personal car':    'high',
  'Charter bus':     'low (shared capacity)',
  'Train / transit': 'lowest',
  'Walking / bike':  'lowest',
};

/**
 * Return the carbon tier string for a transport mode.
 * Defaults to 'medium' for unknown or empty input.
 *
 * @param {string} mode  Transport mode label.
 * @returns {string}
 */
function getCarbonTier(mode) {
  if (typeof mode !== 'string' || !mode) return 'medium';
  return CARBON_TIER[mode] || 'medium';
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident priority ranking
// ─────────────────────────────────────────────────────────────────────────────

/** Numeric rank so sorting is O(1) per comparison. */
const SEV_RANK = { high: 3, med: 2, low: 1 };

/**
 * Sort incidents by severity (descending) and return the top-priority item.
 * Tie-break: preserve original order (most-recent first, per feed convention).
 * Does NOT mutate the input array.
 *
 * @param {Array<{sev: string, txt: string, time: string}>} incidents
 * @returns {{ sev: string, txt: string, time: string } | undefined}
 */
function rankIncidents(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) return undefined;
  return [...incidents].sort(
    (a, b) => (SEV_RANK[b.sev] || 0) - (SEV_RANK[a.sev] || 0)
  )[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — works in both Node.js (require) and browser (<script src>)
// ─────────────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyZoneRisk,
    levelClass,
    getIncidentProtocol,
    getCarbonTier,
    rankIncidents,
    INCIDENT_PROTOCOLS,
    CARBON_TIER,
    WET_CODES,
    WET_PENALTY,
    SEV_RANK,
  };
}
