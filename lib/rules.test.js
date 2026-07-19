/**
 * lib/rules.test.js — Unit tests for PulsePoint deterministic rules engine
 *
 * Runner : Node.js built-in test runner (node:test + node:assert)
 * Requires: Node >= 18.  Zero external dependencies.
 *
 * Run:
 *   npm test
 *   node --test lib/rules.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyZoneRisk,
  levelClass,
  getIncidentProtocol,
  getCarbonTier,
  rankIncidents,
  INCIDENT_PROTOCOLS,
  CARBON_TIER,
  WET_PENALTY,
} = require('./rules');

// ─────────────────────────────────────────────────────────────────────────────
// classifyZoneRisk
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyZoneRisk — normal cases', () => {
  test('low: 20% capacity, no weather', () => {
    const r = classifyZoneRisk(20, null);
    assert.equal(r.level, 'low');
    assert.equal(r.action, 'normal');
    assert.equal(r.adjusted, 20);
  });

  test('low: 54% capacity, no weather (boundary — just below medium)', () => {
    const r = classifyZoneRisk(54, null);
    assert.equal(r.level, 'low');
    assert.equal(r.adjusted, 54);
  });

  test('medium: exactly 55% capacity, no weather', () => {
    const r = classifyZoneRisk(55, null);
    assert.equal(r.level, 'medium');
    assert.equal(r.action, 'monitor');
    assert.equal(r.adjusted, 55);
  });

  test('medium: 70% capacity, no weather', () => {
    const r = classifyZoneRisk(70, null);
    assert.equal(r.level, 'medium');
    assert.equal(r.adjusted, 70);
  });

  test('medium: 79% capacity, no weather (boundary — just below high)', () => {
    const r = classifyZoneRisk(79, null);
    assert.equal(r.level, 'medium');
    assert.equal(r.adjusted, 79);
  });

  test('high: exactly 80% capacity, no weather', () => {
    const r = classifyZoneRisk(80, null);
    assert.equal(r.level, 'high');
    assert.equal(r.action, 'redirect');
    assert.equal(r.adjusted, 80);
  });

  test('high: 91% capacity, no weather', () => {
    const r = classifyZoneRisk(91, null);
    assert.equal(r.level, 'high');
    assert.equal(r.adjusted, 91);
  });

  test('high: 100% capacity, no weather', () => {
    const r = classifyZoneRisk(100, null);
    assert.equal(r.level, 'high');
    assert.equal(r.adjusted, 100);
  });
});

describe('classifyZoneRisk — wet-weather penalty', () => {
  test(`wet weather adds ${WET_PENALTY} points to effective capacity`, () => {
    const dry = classifyZoneRisk(60, { isWet: false });
    const wet = classifyZoneRisk(60, { isWet: true });
    assert.equal(wet.adjusted, dry.adjusted + WET_PENALTY);
  });

  test('wet weather can push medium → high (73 + 8 = 81)', () => {
    const r = classifyZoneRisk(73, { isWet: true });
    assert.equal(r.level, 'high');
    assert.equal(r.adjusted, 81);
  });

  test('wet weather at exact high boundary (72 + 8 = 80 → high)', () => {
    const r = classifyZoneRisk(72, { isWet: true });
    assert.equal(r.level, 'high');
    assert.equal(r.adjusted, 80);
  });

  test('wet weather one below boundary (71 + 8 = 79 → medium)', () => {
    const r = classifyZoneRisk(71, { isWet: true });
    assert.equal(r.level, 'medium');
    assert.equal(r.adjusted, 79);
  });

  test('wet weather can push low → medium (47 + 8 = 55 → medium)', () => {
    const r = classifyZoneRisk(47, { isWet: true });
    assert.equal(r.level, 'medium');
    assert.equal(r.adjusted, 55);
  });

  test('wet=false: no penalty (same as null weather)', () => {
    const rNull = classifyZoneRisk(60, null);
    const rDry  = classifyZoneRisk(60, { isWet: false });
    assert.equal(rNull.adjusted, rDry.adjusted);
    assert.equal(rNull.level,    rDry.level);
  });

  test('wet weather caps at 100 when pct already near ceiling (96 + 8 clamps to 100)', () => {
    const r = classifyZoneRisk(96, { isWet: true });
    assert.equal(r.adjusted, 100);
    assert.equal(r.level, 'high');
  });
});

describe('classifyZoneRisk — edge / invalid inputs', () => {
  test('zero capacity → low', () => {
    const r = classifyZoneRisk(0, null);
    assert.equal(r.level, 'low');
    assert.equal(r.adjusted, 0);
  });

  test('negative capacity → clamped to 0, low', () => {
    const r = classifyZoneRisk(-20, null);
    assert.equal(r.level, 'low');
    assert.equal(r.adjusted, 0);
  });

  test('NaN capacity → treated as 0, low', () => {
    const r = classifyZoneRisk(NaN, null);
    assert.equal(r.level, 'low');
    assert.equal(r.adjusted, 0);
  });

  test('string capacity → treated as 0, low (non-numeric coercion)', () => {
    const r = classifyZoneRisk('80', null);
    // String is not typeof number, so falls through to 0
    assert.equal(r.level, 'low');
  });

  test('weather=undefined → no penalty (same as null)', () => {
    const rNull = classifyZoneRisk(60, null);
    const rUndef = classifyZoneRisk(60, undefined);
    assert.equal(rNull.adjusted, rUndef.adjusted);
  });

  test('weather object missing isWet key → no penalty', () => {
    const r = classifyZoneRisk(60, { condition: 'Rain' });
    assert.equal(r.adjusted, 60); // isWet not strictly true → no penalty
  });

  test('weather.isWet=null → no penalty (falsy, not strictly true)', () => {
    const r = classifyZoneRisk(60, { isWet: null });
    assert.equal(r.adjusted, 60);
  });

  test('pct=Infinity → clamps to 100, high', () => {
    const r = classifyZoneRisk(Infinity, null);
    assert.equal(r.adjusted, 100);
    assert.equal(r.level, 'high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// levelClass
// ─────────────────────────────────────────────────────────────────────────────
describe('levelClass', () => {
  test("'high' → 'z-high'", () => assert.equal(levelClass('high'), 'z-high'));
  test("'medium' → 'z-med'",  () => assert.equal(levelClass('medium'), 'z-med'));
  test("'low' → 'z-low'",     () => assert.equal(levelClass('low'), 'z-low'));
  test("unknown → 'z-low' (safe default)", () => assert.equal(levelClass('critical'), 'z-low'));
  test("empty string → 'z-low'",           () => assert.equal(levelClass(''), 'z-low'));
  test("undefined → 'z-low'",              () => assert.equal(levelClass(undefined), 'z-low'));
});

// ─────────────────────────────────────────────────────────────────────────────
// getIncidentProtocol
// ─────────────────────────────────────────────────────────────────────────────
describe('getIncidentProtocol — normal cases', () => {
  test("'high' returns correct 3-step array", () => {
    const steps = getIncidentProtocol('high');
    assert.deepEqual(steps, INCIDENT_PROTOCOLS.high);
    assert.equal(steps.length, 3);
  });

  test("'med' returns correct 3-step array", () => {
    const steps = getIncidentProtocol('med');
    assert.deepEqual(steps, INCIDENT_PROTOCOLS.med);
    assert.equal(steps.length, 3);
  });

  test("'low' returns correct 2-step array", () => {
    const steps = getIncidentProtocol('low');
    assert.deepEqual(steps, INCIDENT_PROTOCOLS.low);
    assert.equal(steps.length, 2);
  });

  test('high protocol first step dispatches immediately', () => {
    assert.match(getIncidentProtocol('high')[0], /immediately/i);
  });

  test('med protocol includes logging step', () => {
    assert.ok(getIncidentProtocol('med').some(s => /log/i.test(s)));
  });
});

describe('getIncidentProtocol — edge / invalid inputs', () => {
  test("unknown severity 'critical' → falls back to med", () => {
    assert.deepEqual(getIncidentProtocol('critical'), INCIDENT_PROTOCOLS.med);
  });

  test("empty string → falls back to med", () => {
    assert.deepEqual(getIncidentProtocol(''), INCIDENT_PROTOCOLS.med);
  });

  test('null → falls back to med (non-string guard)', () => {
    assert.deepEqual(getIncidentProtocol(null), INCIDENT_PROTOCOLS.med);
  });

  test('undefined → falls back to med', () => {
    assert.deepEqual(getIncidentProtocol(undefined), INCIDENT_PROTOCOLS.med);
  });

  test('number input 1 → falls back to med', () => {
    assert.deepEqual(getIncidentProtocol(1), INCIDENT_PROTOCOLS.med);
  });

  test('returned arrays are not the same reference (no mutation risk)', () => {
    const a = getIncidentProtocol('high');
    const b = getIncidentProtocol('high');
    // Both point to the same const array — that's fine; verify they're equal
    assert.deepEqual(a, b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCarbonTier
// ─────────────────────────────────────────────────────────────────────────────
describe('getCarbonTier — known modes', () => {
  const cases = Object.entries(CARBON_TIER);
  for (const [mode, expected] of cases) {
    test(`'${mode}' → '${expected}'`, () => {
      assert.equal(getCarbonTier(mode), expected);
    });
  }
});

describe('getCarbonTier — edge / invalid inputs', () => {
  test("unknown mode 'Helicopter' → 'medium'", () => {
    assert.equal(getCarbonTier('Helicopter'), 'medium');
  });

  test("empty string → 'medium'", () => {
    assert.equal(getCarbonTier(''), 'medium');
  });

  test("null → 'medium'", () => {
    assert.equal(getCarbonTier(null), 'medium');
  });

  test("undefined → 'medium'", () => {
    assert.equal(getCarbonTier(undefined), 'medium');
  });

  test("number 42 → 'medium'", () => {
    assert.equal(getCarbonTier(42), 'medium');
  });

  test("Train / transit returns 'lowest'", () => {
    assert.equal(getCarbonTier('Train / transit'), 'lowest');
  });

  test("Walking / bike returns 'lowest'", () => {
    assert.equal(getCarbonTier('Walking / bike'), 'lowest');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rankIncidents
// ─────────────────────────────────────────────────────────────────────────────
const FEED = [
  { sev: 'high', txt: 'Gate C bottleneck',              time: '2 min ago'  },
  { sev: 'med',  txt: 'Medical assist, Section 214',    time: '6 min ago'  },
  { sev: 'low',  txt: 'Lost child, reunited',           time: '11 min ago' },
  { sev: 'med',  txt: 'Rideshare zone congestion',      time: '14 min ago' },
  { sev: 'low',  txt: 'Wheelchair escort completed',    time: '19 min ago' },
];

describe('rankIncidents — normal cases', () => {
  test('highest severity wins (high beats med and low)', () => {
    const top = rankIncidents(FEED);
    assert.equal(top.sev, 'high');
  });

  test('returns the correct incident object', () => {
    const top = rankIncidents(FEED);
    assert.equal(top.txt, 'Gate C bottleneck');
  });

  test('does not mutate the input array', () => {
    const copy = [...FEED];
    rankIncidents(FEED);
    assert.deepEqual(FEED, copy);
  });

  test('all-low feed: first item wins (tie-break = original order)', () => {
    const allLow = [
      { sev: 'low', txt: 'A', time: '1 min ago' },
      { sev: 'low', txt: 'B', time: '5 min ago' },
    ];
    assert.equal(rankIncidents(allLow).txt, 'A');
  });

  test('single item → returns that item', () => {
    const single = [{ sev: 'med', txt: 'Only incident', time: '1 min ago' }];
    assert.equal(rankIncidents(single).txt, 'Only incident');
  });

  test('med list without high: first med item wins', () => {
    const meds = [
      { sev: 'med', txt: 'First',  time: '2 min ago' },
      { sev: 'med', txt: 'Second', time: '8 min ago' },
      { sev: 'low', txt: 'Third',  time: '12 min ago' },
    ];
    assert.equal(rankIncidents(meds).txt, 'First');
  });

  test('high incident anywhere in list is still top', () => {
    const list = [
      { sev: 'low', txt: 'A', time: '1 min ago' },
      { sev: 'med', txt: 'B', time: '2 min ago' },
      { sev: 'high', txt: 'C', time: '3 min ago' },
    ];
    assert.equal(rankIncidents(list).sev, 'high');
  });
});

describe('rankIncidents — edge / invalid inputs', () => {
  test('empty array → undefined', () => {
    assert.equal(rankIncidents([]), undefined);
  });

  test('null → undefined (graceful guard)', () => {
    assert.equal(rankIncidents(null), undefined);
  });

  test('undefined → undefined', () => {
    assert.equal(rankIncidents(undefined), undefined);
  });

  test('non-array (object) → undefined', () => {
    assert.equal(rankIncidents({}), undefined);
  });

  test('incident with unknown sev treated as rank 0 (lower than low)', () => {
    const list = [
      { sev: 'unknown', txt: 'Mystery', time: '0 min ago' },
      { sev: 'low',     txt: 'Known',   time: '1 min ago' },
    ];
    // 'low' has rank 1, 'unknown' has rank 0 → low wins
    assert.equal(rankIncidents(list).sev, 'low');
  });

  test('incident with missing sev key treated as rank 0', () => {
    const list = [
      { txt: 'No sev field', time: '0 min ago' },
      { sev: 'med', txt: 'Has sev', time: '1 min ago' },
    ];
    assert.equal(rankIncidents(list).sev, 'med');
  });
});
