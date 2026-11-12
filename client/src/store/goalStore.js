import { create } from 'zustand';
import { fetchGoal, updateGoal } from '../api/learning.js';

/** Daily goal / streak shared by the nav chip, the progress page and the reminder. */
export const useGoalStore = create((set, get) => ({
  goal: null,
  celebrate: false,

  async refresh() {
    try {
      const prev = get().goal;
      const next = await fetchGoal();
      const justCompleted = prev && !prev.completed && next.completed;
      set({ goal: next, celebrate: justCompleted || get().celebrate });
    } catch {
      /* not signed in or offline — the widget just stays hidden */
    }
  },

  async save(payload) {
    const next = await updateGoal(payload);
    set({ goal: next });
    return next;
  },

  dismissCelebrate() {
    set({ celebrate: false });
  },

  reset() {
    set({ goal: null, celebrate: false });
  },
}));
