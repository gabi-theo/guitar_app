export type TechniqueMarker = "pick" | "hammer" | "pull" | "tap" | "slide";

/** One note of an exercise pattern — same schema as the backend `note_pattern`. */
export interface PatternNote {
  string: number; // 1 = high E ... 6 = low E
  fret: number;
  duration: number; // in beats (quarter = 1.0)
  technique_marker: TechniqueMarker;
}

/** PatternNote enriched with its computed absolute start position. */
export interface TimedNote extends PatternNote {
  index: number;
  startBeat: number;
  midi: number;
}

export interface Technique {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export type ExerciseVisibility = "private" | "shared";

export interface Exercise {
  id: number;
  technique: Technique;
  name: string;
  description: string;
  difficulty: number;
  bpm_levels: number[];
  note_pattern?: PatternNote[];
  visibility: ExerciseVisibility;
  is_custom: boolean;
  is_owner: boolean;
  owner_name: string | null;
}

export interface PracticeAttempt {
  id: number;
  exercise: number;
  exercise_name: string;
  technique_slug: string;
  bpm_target: number;
  timing_accuracy: number;
  pitch_accuracy: number;
  accuracy: number;
  bpm_achieved: number;
  score: number;
  verified: boolean;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
}

export type NoteResult = "pending" | "hit" | "wrong_pitch" | "missed";

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  display_name: string;
  bpm_target: number;
  accuracy: number;
  score: number;
  created_at: string;
}

export type ChallengeStatus = "open" | "complete" | "declined";

export interface Challenge {
  id: number;
  challenger: number;
  challenger_name: string;
  opponent_name: string;
  exercise: number;
  exercise_name: string;
  bpm_target: number;
  status: ChallengeStatus;
  challenger_score: number | null;
  opponent_score: number | null;
  winner: number | null;
  winner_name: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type DailyChallengeKind = "consolidate" | "push" | "explore";

export interface DailyChallenge {
  id: number;
  date: string;
  kind: DailyChallengeKind;
  exercise: number;
  exercise_name: string;
  technique_slug: string;
  technique_name: string;
  bpm_target: number;
  target_accuracy: number;
  title: string;
  completed: boolean;
  completed_at: string | null;
}

export type ObjectiveStatus = "active" | "achieved";

export interface Objective {
  id: number;
  exercise: number;
  exercise_name: string;
  technique_name: string;
  target_bpm: number;
  target_accuracy: number;
  initial_target_date: string;
  target_date: string;
  start_effective_bpm: number;
  best_effective_bpm: number;
  progress_percent: number;
  days_adjustment: number; // negative = ahead of the original plan
  status: ObjectiveStatus;
  created_at: string;
  achieved_at: string | null;
}

export interface TechniqueStats {
  slug: string;
  name: string;
  attempts: number;
  best_score: number;
  avg_accuracy: number;
  best_clean_bpm: number | null;
  last_practiced: string;
}

export interface StatsOverview {
  total_attempts: number;
  practice_days: number;
  current_streak: number;
  best_score: number | null;
  best_score_exercise: string | null;
  attempts_30d: number;
  avg_accuracy_30d: number | null;
  techniques: TechniqueStats[];
}

export interface ProgressPoint {
  date: string;
  attempts: number;
  best_score: number;
  avg_accuracy: number;
  max_bpm: number;
}

export interface ProgressSeries {
  days: number;
  series: ProgressPoint[];
}

/** DRF page envelope (attempts endpoint is paginated). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
