import { BloodGroup, isValidBloodGroup } from './blood-compatibility.ts';

export const EMBEDDING_DIMENSIONS = 128;

export interface ExtractedRequestContext {
  urgencyIndicators: string[];
  suggestedPriority: 'Emergency' | 'Urgent' | 'Routine';
  detectedBloodGroup: BloodGroup | null;
  detectedUnits: number | null;
  medicalContext: string[];
  timeSensitivity: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const SEMANTIC_CLUSTERS: Array<{ label: string; keywords: string[]; weight: number }> = [
  {
    label: 'critical_emergency',
    keywords: [
      'immediate',
      'immediately',
      'critical',
      'emergency',
      'life-threatening',
      'stat',
      'code',
      'massive',
      'hemorrhage',
      'bleeding',
      'shock',
    ],
    weight: 3.2,
  },
  {
    label: 'trauma_accident',
    keywords: [
      'accident',
      'trauma',
      'crash',
      'collision',
      'injury',
      'icu',
      'er',
      'casualty',
      'fracture',
    ],
    weight: 2.8,
  },
  {
    label: 'surgery_operative',
    keywords: [
      'surgery',
      'surgical',
      'operation',
      'operating',
      'theatre',
      'cardiac',
      'bypass',
      'transplant',
      'cesarean',
      'post-op',
    ],
    weight: 2.5,
  },
  {
    label: 'maternal_obstetric',
    keywords: [
      'maternal',
      'obstetric',
      'postpartum',
      'delivery',
      'pregnancy',
      'labor',
      'neonatal',
      'pediatric',
    ],
    weight: 2.5,
  },
  {
    label: 'scheduled_routine',
    keywords: [
      'scheduled',
      'planned',
      'routine',
      'elective',
      'upcoming',
      'next week',
      'pre-op',
      'maintenance',
      'anemia',
      'thalassemia',
      'dialysis',
      'oncology',
    ],
    weight: 2.4,
  },
  {
    label: 'urgent_timely',
    keywords: [
      'urgent',
      'urgently',
      'today',
      'tonight',
      'hours',
      'soon',
      'priority',
      'shortage',
      'low',
    ],
    weight: 2.4,
  },
  {
    label: 'universal_rh_negative',
    keywords: [
      'negative',
      'o-',
      'o negative',
      'universal',
      'rare',
      'crossmatch',
      'incompatible',
    ],
    weight: 2.2,
  },
];

function fnv1aHash(str: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function matchesKeyword(lowerText: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerText);
}

/**
 * Extracts structured clinical/logistical metadata from free-text blood request descriptions.
 */
export function extractRequestContext(text: string): ExtractedRequestContext {
  const lower = text.toLowerCase();

  const urgencyIndicators: string[] = [];
  for (const cluster of SEMANTIC_CLUSTERS) {
    for (const kw of cluster.keywords) {
      if (matchesKeyword(lower, kw) && !urgencyIndicators.includes(kw)) {
        urgencyIndicators.push(kw);
      }
    }
  }

  let suggestedPriority: 'Emergency' | 'Urgent' | 'Routine' = 'Routine';
  if (
    /\b(immediate|immediately|critical|emergency|hemorrhage|trauma|accident|life-threatening|massive|stat)\b/i.test(
      lower,
    )
  ) {
    suggestedPriority = 'Emergency';
  } else if (
    /\b(urgent|urgently|today|tonight|within hours|asap|priority|shortage)\b/i.test(
      lower,
    )
  ) {
    suggestedPriority = 'Urgent';
  }

  // Extract blood group (e.g., "O-", "O negative", "AB positive", "A+")
  let detectedBloodGroup: BloodGroup | null = null;
  const symbolicMatch = text.match(/\b(AB|A|B|O)\s*([+-])\b/i);
  if (symbolicMatch) {
    const candidate = `${symbolicMatch[1].toUpperCase()}${symbolicMatch[2]}`;
    if (isValidBloodGroup(candidate)) {
      detectedBloodGroup = candidate;
    }
  } else {
    const wordMatch = text.match(/\b(AB|A|B|O)\s+(positive|negative|pos|neg)\b/i);
    if (wordMatch) {
      const sign = wordMatch[2].toLowerCase().startsWith('pos') ? '+' : '-';
      const candidate = `${wordMatch[1].toUpperCase()}${sign}`;
      if (isValidBloodGroup(candidate)) {
        detectedBloodGroup = candidate;
      }
    }
  }

  // Extract units required (e.g., "2 units", "two units", "4 bags")
  let detectedUnits: number | null = null;
  const numUnitMatch = lower.match(/\b(\d{1,2})\s*(units?|bags?|pints?)\b/);
  if (numUnitMatch) {
    detectedUnits = Number(numUnitMatch[1]);
  } else {
    const wordUnitMatch = lower.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(units?|bags?|pints?)\b/,
    );
    if (wordUnitMatch) {
      detectedUnits = NUMBER_WORDS[wordUnitMatch[1]] ?? null;
    }
  }

  const medicalContext: string[] = [];
  if (/\b(accident|trauma|crash|injury|er|icu)\b/i.test(lower)) {
    medicalContext.push('Trauma & Emergency Care');
  }
  if (/\b(surgery|surgical|operation|cardiac|bypass|transplant|theatre)\b/i.test(lower)) {
    medicalContext.push('Surgical Procedure');
  }
  if (/\b(maternal|obstetric|delivery|postpartum|cesarean|pregnancy)\b/i.test(lower)) {
    medicalContext.push('Maternal / Obstetric');
  }
  if (/\b(scheduled|planned|elective|anemia|thalassemia|oncology|dialysis)\b/i.test(lower)) {
    medicalContext.push('Planned / Chronic Transfusion');
  }
  if (medicalContext.length === 0) {
    medicalContext.push('General Hospital Transfusion');
  }

  const timeSensitivity =
    suggestedPriority === 'Emergency'
      ? 'Immediate (< 2 hours)'
      : suggestedPriority === 'Urgent'
        ? 'Time-Sensitive (< 24 hours)'
        : 'Scheduled (> 24 hours)';

  return {
    urgencyIndicators: urgencyIndicators.slice(0, 8),
    suggestedPriority,
    detectedBloodGroup,
    detectedUnits,
    medicalContext,
    timeSensitivity,
  };
}

/**
 * Generates a normalized 128-dimensional semantic embedding locally without external paid APIs.
 * Combines clinical semantic cluster features (first 32 dims) + token & character trigram
 * random projection (remaining 96 dims) with L2 normalization for pgvector cosine similarity (<=>).
 */
export function generateLocalSemanticEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const lower = text.toLowerCase().trim();
  const context = extractRequestContext(lower);

  // 1. Semantic domain cluster features (dims 0..31)
  SEMANTIC_CLUSTERS.forEach((cluster, idx) => {
    let hits = 0;
    for (const kw of cluster.keywords) {
      if (matchesKeyword(lower, kw)) hits += 1;
    }
    if (hits > 0) {
      const base = (idx * 4) % 32;
      vec[base] += cluster.weight * Math.min(2.5, hits);
      vec[(base + 1) % 32] += cluster.weight * 0.6;
    }
  });

  if (context.detectedBloodGroup) {
    const bgIdx = fnv1aHash(context.detectedBloodGroup, 97) % 16;
    vec[16 + bgIdx] += 1.5;
  }

  // 2. Token + bigram + trigram hashed projection (dims 32..127)
  const tokens = lower
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const h1 = fnv1aHash(tok, 131);
    const h2 = fnv1aHash(tok, 733);
    const dim1 = 32 + (h1 % 96);
    const dim2 = 32 + (h2 % 96);
    vec[dim1] += 1.4;
    vec[dim2] += h2 % 2 === 0 ? 0.8 : -0.8;

    if (i < tokens.length - 1) {
      const bigram = `${tok}_${tokens[i + 1]}`;
      const hb = fnv1aHash(bigram, 991);
      vec[32 + (hb % 96)] += 1.1;
    }

    if (tok.length >= 4) {
      for (let c = 0; c <= tok.length - 3; c++) {
        const tri = tok.slice(c, c + 3);
        const ht = fnv1aHash(tri, 509);
        vec[32 + (ht % 96)] += 0.35;
      }
    }
  }

  // L2 Normalize so pgvector cosine distance (<=>) equals 1 - dot(a, b)
  let normSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) {
    vec[0] = 1;
    return vec;
  }
  return vec.map((v) => Math.round((v / norm) * 1e6) / 1e6);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.round((dot / (Math.sqrt(normA) * Math.sqrt(normB))) * 1000) / 1000;
}

export function explainSemanticRetrieval(
  queryText: string,
  candidateText: string,
  similarityScore: number,
): string {
  const qCtx = extractRequestContext(queryText);
  const cCtx = extractRequestContext(candidateText);

  const sharedIndicators = qCtx.urgencyIndicators.filter((i) =>
    cCtx.urgencyIndicators.includes(i),
  );
  const sharedMedical = qCtx.medicalContext.filter((m) =>
    cCtx.medicalContext.includes(m),
  );

  const parts: string[] = [
    `Cosine similarity ${(similarityScore * 100).toFixed(1)}%`,
  ];
  if (sharedMedical.length > 0) {
    parts.push(`shared context: ${sharedMedical.join(', ')}`);
  }
  if (sharedIndicators.length > 0) {
    parts.push(`matching urgency cues: ${sharedIndicators.slice(0, 4).join(', ')}`);
  }
  if (
    qCtx.detectedBloodGroup &&
    qCtx.detectedBloodGroup === cCtx.detectedBloodGroup
  ) {
    parts.push(`same blood group reference (${qCtx.detectedBloodGroup})`);
  }
  if (parts.length === 1) {
    parts.push(`aligned clinical phrasing & priority tier (${cCtx.suggestedPriority})`);
  }

  return parts.join(' · ');
}
