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
  overall: number;        // 0-100
  grade: string;          // A-F
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
