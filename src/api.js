const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

export function apiUrl(path) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}
