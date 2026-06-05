'use client';

import { create } from 'zustand';
import { ParseRule, RuleConfig } from '@/types/rule';

interface RuleStore {
  rules: ParseRule[];
  loading: boolean;
  setRules: (rules: ParseRule[]) => void;
  addRule: (rule: ParseRule) => void;
  updateRule: (id: string, updates: Partial<ParseRule>) => void;
  removeRule: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useRuleStore = create<RuleStore>((set) => ({
  rules: [],
  loading: false,
  setRules: (rules) => set({ rules }),
  addRule: (rule) => set((state) => ({ rules: [...state.rules, rule] })),
  updateRule: (id, updates) =>
    set((state) => ({
      rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  removeRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
}));
