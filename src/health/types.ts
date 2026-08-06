/**
 * Health Score Type Definitions
 */

export interface HealthDimension {
  name: string;
  score: number;          // 0-100
  weight: number;         // 0-1
  grade: string;          // A-F
  details: string;        // Human-readable explanation
  metrics: Record<string, number | string>;  // Raw metric values
}

export interface HealthReport {
  // 'scored' means the six dimensions were actually measured against real
  // symbols/edges. 'no_parseable_files' means nothing was analyzed — the
  // numeric fields below are placeholders, not a measurement, and must
  // never be presented to a user or CI system as a passing (or failing)
  // score. Always check `status` before trusting `overall`/`grade`.
  status: 'scored' | 'no_parseable_files';
  overall: number;        // 0-100 (NaN when status is 'no_parseable_files')
  grade: string;          // A-F ('N/A' when status is 'no_parseable_files')
  dimensions: HealthDimension[];
  summary: string;        // Human-readable summary
  recommendations: string[];  // Actionable suggestions
  projectStats: {
    files: number;
    symbols: number;
    edges: number;
    languages: Record<string, number>;
  };
  timestamp: string;
  // Present only when status === 'no_parseable_files'.
  message?: string;
  supportedExtensions?: string[];
}

export interface HealthHistory {
  timestamp: string;
  score: number;
  grade: string;
  dimensions: Array<{
    name: string;
    score: number;
    grade: string;
  }>;
}
