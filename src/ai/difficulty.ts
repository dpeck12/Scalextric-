export type DifficultyPreset = {
  name: string;
  alpha: number; // safety margin multiplier
  pid: { kp: number; ki: number; kd: number };
};

export const DIFFICULTY: DifficultyPreset[] = [
  { name: 'Easy', alpha: 0.80, pid: { kp: 0.5, ki: 0.05, kd: 0.01 } },
  { name: 'Medium', alpha: 0.90, pid: { kp: 0.6, ki: 0.10, kd: 0.02 } },
  { name: 'Hard', alpha: 0.96, pid: { kp: 0.7, ki: 0.12, kd: 0.03 } }
];
