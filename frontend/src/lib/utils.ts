import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PaginatedResponse } from "@/types/common"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize a DRF list or paginated `{ results: T[] }` response into an array. */
export function toApiList<T>(data: T[] | PaginatedResponse<T> | undefined | null): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.results)) return data.results
  return []
}