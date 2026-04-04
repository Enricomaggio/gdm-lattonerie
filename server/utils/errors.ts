// Helper: rileva errori di unique constraint PostgreSQL (codice 23505)
export function isUniqueConstraintError(error: any): boolean {
  return error?.code === "23505" ||
    (typeof error?.message === "string" && error.message.includes("unique constraint")) ||
    (typeof error?.message === "string" && error.message.includes("duplicate key"));
}
