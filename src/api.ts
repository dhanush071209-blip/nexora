export const API = import.meta.env.VITE_API_URL || "";
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(API + "/api" + url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The NEXORA server is not connected. Run the included backend to use live features.",
    );
  }
  if (!response.ok) throw Error(data.error || "Request failed.");
  return data;
}
export const post = <T = any>(url: string, data: unknown = {}) =>
  api<T>(url, { method: "POST", body: JSON.stringify(data) });
export const patch = <T = any>(url: string, data: unknown) =>
  api<T>(url, { method: "PATCH", body: JSON.stringify(data) });
export const remove = (url: string) => api(url, { method: "DELETE" });
