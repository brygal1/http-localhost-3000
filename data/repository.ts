import dataset from "@/app/shiftahead-data.json";
import type { WorkerProfile } from "@/domain/types";

export type ShiftAheadDataset = typeof dataset;

export function getDataset(): ShiftAheadDataset {
  return dataset;
}

export function listWorkers(): WorkerProfile[] {
  return dataset.workers as WorkerProfile[];
}

export function getDefaultWorkerId(): string {
  return dataset.defaultWorkerId;
}

export function getWorker(workerId: string): WorkerProfile | null {
  return listWorkers().find((worker) => worker.id === workerId) ?? null;
}

export function getWorkerOrDefault(workerId?: string | null): WorkerProfile {
  return (
    (workerId ? getWorker(workerId) : null) ??
    getWorker(getDefaultWorkerId()) ??
    listWorkers()[0]!
  );
}

export function workerLabel(worker: WorkerProfile): string {
  return `${worker.occupation} · ${worker.city}`;
}
