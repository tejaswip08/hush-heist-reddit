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

export type CompleteResponse = {
  type: 'complete';
  streak: number;
  firstEscape: boolean;
  stats: NightStats;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
