/**
 * Extract a clean material name from an upload file URL.
 *
 * Example: "https://.../uploads/pending/f4d32c2a-1234-...-Mansao_Othon.pdf"
 *      → "Mansao Othon"
 */
export function extractMaterialName(fileUrl: string | undefined): string {
  if (!fileUrl) return "Material";
  try {
    const path = new URL(fileUrl).pathname;
    let filename = decodeURIComponent(path.split("/").pop() || "");
    // Remove UUID prefix (e.g., "f4d32c2a-...-Mansao_Othon.pdf")
    filename = filename.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
    // Remove extension
    filename = filename.replace(/\.\w+$/, "");
    // Remove parenthetical suffixes like " (6)"
    filename = filename.replace(/\s*\(\d+\)\s*$/, "");
    // Replace underscores with spaces
    filename = filename.replace(/_/g, " ");
    return filename.trim() || "Material";
  } catch {
    return "Material";
  }
}
