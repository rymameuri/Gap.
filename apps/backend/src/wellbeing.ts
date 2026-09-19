/**
 * Screens student messages for signs of distress so a teacher can check in.
 *
 * Deliberately rule-based: a fixed phrase list is predictable, auditable and
 * never unavailable, which matters for safety. It errs toward flagging, since
 * a teacher dismissing a false alarm costs far less than a missed one.
 */

export const FLAG_SEVERITIES = ["urgent", "high", "medium", "low"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

export const FLAG_CATEGORIES = [
  "self_harm",
  "safety",
  "distress",
  "low_mood",
  "anxiety",
  "isolation",
  "quitting",
] as const;
export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

export interface WellbeingSignal {
  category: FlagCategory;
  severity: FlagSeverity;
}

interface Rule extends WellbeingSignal {
  pattern: RegExp;
}

const rule = (
  category: FlagCategory,
  severity: FlagSeverity,
  pattern: RegExp,
): Rule => ({ category, severity, pattern });

// Ordered most to least severe; the first match wins.
const RULES: readonly Rule[] = [
  rule(
    "self_harm",
    "urgent",
    /\b(suicid\w*|kill(ing)? myself|end(ing)? (my|it all|my own) life|end it all|take my (own )?life|want(ed)? to die|wanna die|(don'?t|do not|no longer) want to (live|be alive|be here|exist)|better off (dead|without me)|no (reason|point) (to|in) (live|living|going on)|hurt(ing)? myself|harm(ing)? myself|self[- ]?harm\w*|cut(ting)? myself|overdose)\b/,
  ),
  rule(
    "safety",
    "urgent",
    /\b((is|are|keeps?|been) (hitting|hurting|abusing|beating|touching) me|(i am|i'?m|im) (being )?(abused|assaulted)|(i|i'?m|im) (feel|am|is) (not |un)?safe at home|afraid to go home|scared to go home|someone (is )?(hurting|threatening) me)\b/,
  ),
  rule(
    "distress",
    "high",
    /\b(hopeless|worthless|can'?t (go on|take (it|this) anymore|do this anymore)|hate myself|panic attack\w*|can'?t breathe|breaking down|breakdown|want to disappear|wish i (was|were) (gone|invisible)|nobody would (notice|care|miss)|no one would (notice|care|miss)|not worth it|give up on (everything|life))\b/,
  ),
  rule(
    "low_mood",
    "medium",
    /\b(depress\w*|feel(ing)? (so )?(empty|numb|down)|(always|constantly|all the time) (sad|crying)|cry(ing)? (every|all)|(don'?t|do not) care (about anything|anymore)|nothing (matters|makes me happy))\b/,
  ),
  rule(
    "anxiety",
    "medium",
    /\b(anxi(ous|ety)|overwhelm\w*|stress(ed|ing)? out|so stressed|burn(t|ed)[- ]?out|can'?t cope|can'?t sleep|not sleeping|exhausted|too much pressure|freak(ing)? out|scared (of|to) (fail|fail|ask))\b/,
  ),
  rule(
    "isolation",
    "medium",
    /\b(no (friends|one to talk)|lonely|loneliness|(i am|i'?m|im) (all )?alone|bull(y|ied|ying)|nobody (likes|talks to|cares about) me|no one (likes|talks to|cares about) me|left out)\b/,
  ),
  rule(
    "quitting",
    "low",
    /\b(want to (quit|drop out)|drop(ping)? out|i give up|giving up|(i'?m|im|i am) (so )?(stupid|dumb|useless)|i'?ll never (get|understand|pass)|(i'?m|im|i am) (going to|gonna) fail)\b/,
  ),
];

const normalise = (text: string): string =>
  text.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'");

/** The most severe signal in `text`, or null when nothing concerning is found. */
export function screenWellbeing(text: string): WellbeingSignal | null {
  const input = normalise(text);
  for (const { pattern, category, severity } of RULES)
    if (pattern.test(input)) return { category, severity };
  return null;
}
