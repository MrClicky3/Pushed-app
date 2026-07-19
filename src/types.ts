// How an exercise is loaded. 'weighted_bw' stores the *added* weight in `weight`.
export type LoadType = 'weighted' | 'bodyweight' | 'weighted_bw';

export interface Exercise {
  id: string;
  device_id: string;
  name: string;
  muscle_group: string;
  target_reps: number;
  sets: number;
  weight: number;
  load_type?: LoadType;
  created_at: string;
}

export type SetType = 'warmup' | 'working' | 'drop';

export interface WorkoutLog {
  id: string;
  device_id: string;
  exercise_id: string;
  reps_done: number;
  weight: number;
  sets: number;
  comment: string;
  set_type?: SetType;
  // Outlier guard: sets far above the user's own rolling average for the
  // exercise are flagged on insert and excluded from competition scoring.
  is_flagged?: boolean;
  flag_reason?: string | null;
  created_at: string;
  exercises?: Exercise;
}


export interface Routine {
  id: string;
  user_id: string;
  name: string;
  exercise_ids: string[];
  created_at: string;
}

export interface ScheduleDay {
  id: string;
  user_id: string;
  day_of_week: number;
  routine_id: string | null;
  routines?: Routine | null;
}

// ── Social / "Compete with friends" ───────────────────────────
export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  invite_code: string;
  created_at: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  total_completed_days: number;
  updated_at: string;
}

// Relationship of a searched user relative to the current user.
export type RelationState = 'none' | 'requested' | 'incoming' | 'friends';

export interface SearchResult {
  id: string;
  username: string;
  display_name: string | null;
  relation: RelationState;
}

// A pending friend request joined with the other user's profile.
export interface PendingRequest {
  friendshipId: string;
  userId: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// get_friend_leaderboard() row. (The RPC still returns consistency_score; the
// app no longer surfaces it anywhere, so it is not typed.)
export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  current_streak: number;
  longest_streak: number;
  is_self: boolean;
}

// get_friend_volume_leaderboard() row.
export interface VolumeRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  volume: number;
  is_self: boolean;
}

// ── Competitions ──────────────────────────────────────────────
// The retired 'consistency' track is converted to 'streak' by the 2026-07-19
// migration, so no row carries it any more.
export type CompetitionTrack = 'volume' | 'streak';
export type CompetitionStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type ParticipantStatus = 'invited' | 'accepted' | 'declined';
export type BadgeTier = 'gold' | 'silver' | 'bronze' | 'finisher';

// get_my_competitions() row — one card in the list.
export interface CompetitionSummary {
  id: string;
  name: string;
  track: CompetitionTrack;
  timezone: string;
  start_at: string;
  end_at: string;
  status: CompetitionStatus;
  cancelled_reason: 'insufficient_players' | 'mutual_agreement' | null;
  created_by: string;
  is_creator: boolean;
  my_status: ParticipantStatus;
  participant_count: number;
}

// get_competition_standings() row. score is the ranking value: raw kg lifted
// inside the window for the volume track, current streak in days for the
// streak track. `delta` is a legacy field (old volume %Δ), NULL on new rows.
// Live rows carry rank; pre-start/cancelled rows leave it null.
export interface CompetitionStanding {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: ParticipantStatus;
  score: number | null;
  delta: number | null;
  scored_days: number;
  rank: number | null;
  is_self: boolean;
  voted_cancel: boolean;
}

export interface Badge {
  id: string;
  user_id: string;
  competition_id: string | null;
  tier: BadgeTier;
  awarded_at: string;
}

// get_friend_activity() — aggregate activity for a friend's profile view.
export interface ActivityWindow {
  volume: number;
  sets: number;
  active_days: number;
}

export interface FriendActivity {
  d7: ActivityWindow;
  d30: ActivityWindow;
  d90: ActivityWindow;
}
