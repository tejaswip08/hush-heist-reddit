// One colour mood per episode: a gradient sky plus matching light. This is
// all the colour grading Hush does — no post-processing, so it stays cheap.
// There are 10 moods and 9 levels, so a level gets a new sky each time the
// level list comes round again.

export type Mood = {
  name: string;
  /** Sky gradient, top → horizon → bottom */
  sky: [string, string, string];
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  key: number;
  keyIntensity: number;
  /** Where the sun or moon sits; low and to the side gives long shadows */
  keyPos: [number, number, number];
  exposure: number;
};

export const MOODS: Mood[] = [
  {
    name: 'Rose sunset',
    sky: ['#c98f8a', '#e8b4a2', '#f4d6c6'],
    hemiSky: 0xffd9c8,
    hemiGround: 0x6a5058,
    hemi: 0.75,
    key: 0xffc59e,
    keyIntensity: 1.25,
    keyPos: [-9, 6, -2],
    exposure: 1.0,
  },
  {
    name: 'Blue night',
    sky: ['#1c2433', '#3b4a5e', '#6b7b8e'],
    hemiSky: 0x9fb3d6,
    hemiGround: 0x2c2826,
    hemi: 0.55,
    key: 0xbcd0ff,
    keyIntensity: 0.7,
    keyPos: [-6, 11, 3],
    exposure: 1.05,
  },
  {
    name: 'Dawn lavender',
    sky: ['#7d74a8', '#b9a6cf', '#e6d6e8'],
    hemiSky: 0xe6dcff,
    hemiGround: 0x4f4660,
    hemi: 0.72,
    key: 0xffe0f0,
    keyIntensity: 1.0,
    keyPos: [8, 7, -4],
    exposure: 1.0,
  },
  {
    name: 'Teal dusk',
    sky: ['#17363d', '#2f6b6e', '#7fb0a8'],
    hemiSky: 0xa8e0d8,
    hemiGround: 0x2a3330,
    hemi: 0.6,
    key: 0xffd2a8,
    keyIntensity: 0.9,
    keyPos: [-8, 5, 4],
    exposure: 1.05,
  },
  {
    name: 'Golden hour',
    sky: ['#c9822f', '#efb45e', '#f8e1b0'],
    hemiSky: 0xffe6b8,
    hemiGround: 0x6b5236,
    hemi: 0.7,
    key: 0xffc073,
    keyIntensity: 1.35,
    keyPos: [9, 5, 2],
    exposure: 0.98,
  },
  {
    name: 'Misty blue',
    sky: ['#5f7891', '#9fb4c6', '#d9e2ea'],
    hemiSky: 0xdfeaf5,
    hemiGround: 0x4a5560,
    hemi: 0.8,
    key: 0xf2f6ff,
    keyIntensity: 0.85,
    keyPos: [-5, 12, -3],
    exposure: 1.0,
  },
  {
    name: 'Emerald twilight',
    sky: ['#12261c', '#2e5a3e', '#8db58c'],
    hemiSky: 0xbfe8c4,
    hemiGround: 0x23301f,
    hemi: 0.58,
    key: 0xffe7b0,
    keyIntensity: 0.85,
    keyPos: [7, 7, -5],
    exposure: 1.05,
  },
  {
    name: 'Crimson evening',
    sky: ['#3d0f17', '#8e2c32', '#e0866b'],
    hemiSky: 0xffb8a8,
    hemiGround: 0x3a1f22,
    hemi: 0.62,
    key: 0xff9e78,
    keyIntensity: 1.1,
    keyPos: [-9, 5, 3],
    exposure: 1.0,
  },
  {
    name: 'Deep navy',
    sky: ['#070b18', '#16223f', '#33466e'],
    hemiSky: 0x7f93c7,
    hemiGround: 0x1a1a22,
    hemi: 0.48,
    key: 0xa9bfff,
    keyIntensity: 0.6,
    keyPos: [5, 12, -4],
    exposure: 1.1,
  },
  {
    name: 'Silver fog',
    sky: ['#77787d', '#a9aaae', '#dcdcdc'],
    hemiSky: 0xf0f0f0,
    hemiGround: 0x55565a,
    hemi: 0.82,
    key: 0xffffff,
    keyIntensity: 0.75,
    keyPos: [-4, 12, 5],
    exposure: 1.0,
  },
];

/** The mood for an episode (night 1, 2, 3 …). */
export const moodFor = (episode: number): Mood => {
  const i = (((episode - 1) % MOODS.length) + MOODS.length) % MOODS.length;
  return MOODS[i] ?? MOODS[0]!;
};
