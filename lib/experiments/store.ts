export type ExperimentStatus = "draft" | "running" | "won" | "lost";

export type Experiment = {
  id: string;
  hypothesis: string;
  control: string;
  variant: string;
  primaryMetric: string;
  status: ExperimentStatus;
  createdAt: string;
};

const KEY = "zooptrack-experiments-v1";

export function loadExperiments(): Experiment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Experiment[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function saveExperiments(list: Experiment[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
}

export function createExperiment(partial: Omit<Experiment, "id" | "createdAt" | "status"> & { status?: ExperimentStatus }): Experiment {
  return {
    ...partial,
    status: partial.status ?? "draft",
    id: `EXP-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString()
  };
}
