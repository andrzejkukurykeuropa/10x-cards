import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { readFileSync } from "node:fs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
