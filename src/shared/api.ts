export type NightStats = {
  /** Players who escaped this night */
  escapes: number;
  /** Players who escaped at or under par */
  parEscapes: number;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  subredditName: string;
  night: number;
  streak: number;
  /** Best result on this night, if already played */
  best: { moves: number; stars: number } | null;
  stats: NightStats;
};

export type CompleteRequest = {
  night: number;
  moves: number;
  stars: number;
};

export type BoardEntry = {
  rank: number;
  username: string;
  moves: number;
  stars: number;
};

/** Tonight's top thieves, plus where you stand. */
export type Leaderboard = {
  top: BoardEntry[];
  me: BoardEntry | null;
  /** Players on the board (everyone who escaped) */
  total: number;
};

export type CompleteResponse = {
  type: 'complete';
  streak: number;
  firstEscape: boolean;
  stats: NightStats;
  board: Leaderboard;
};

export type CaughtRequest = {
  night: number;
  moves: number;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export type CommentRequest = { night: number };
export type CommentResponse = { type: 'comment'; posted: boolean };
