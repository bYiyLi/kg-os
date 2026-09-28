import type { JsonObject } from "@kgos/sdk";

export interface DoctorCheck {
  id: string;
  status: "ok" | "info" | "error";
  blocking: boolean;
  message: string;
  details?: JsonObject;
}

export interface DoctorCheckInput {
  status: DoctorCheck["status"];
  blocking: boolean;
  message: string;
  details?: JsonObject;
}

export function doctorCheck(id: string, input: DoctorCheckInput): DoctorCheck {
  const result: DoctorCheck = {
    id,
    status: input.status,
    blocking: input.blocking,
    message: input.message
  };
  if (input.details !== undefined) result.details = input.details;
  return result;
}
