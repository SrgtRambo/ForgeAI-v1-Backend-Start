// Replit-native API client.
// Calls the Forge AI backend directly via fetch.
const BACKEND_URL = import.meta.env["VITE_BACKEND_URL"] || "";

function backendUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

export interface ApiUser {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
}

export interface ApiProject {
  id: string;
  name: string;
  stage: string;
  data: Record<string, unknown>;
  updated_at: string;
  share_token?: string | null;
  visibility?: string;
  type?: string | null;
  version?: number;
  created_at?: string;
}

async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(backendUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

export async function getCurrentUser(): Promise<ApiUser> {
  const res = await apiRequest("/api/users/me");
  const data = await res.json();
  return data.user;
}

export async function updateUser(updates: { name?: string; email?: string }): Promise<ApiUser> {
  const res = await apiRequest("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  return data.user;
}

export async function listProjects(): Promise<ApiProject[]> {
  const res = await apiRequest("/api/projects");
  const data = await res.json();
  return data.projects;
}

export async function createProject(project: {
  id: string;
  name?: string;
  stage?: string;
  data?: Record<string, unknown>;
}): Promise<ApiProject> {
  const res = await apiRequest("/api/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
  const data = await res.json();
  return data.project;
}

export async function updateProject(
  id: string,
  updates: { name?: string; stage?: string; data?: Record<string, unknown> },
): Promise<ApiProject> {
  const res = await apiRequest(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await apiRequest(`/api/projects/${id}`, { method: "DELETE" });
}

export async function getPurchase(purchaseId: string) {
  const res = await apiRequest(`/api/purchases/${purchaseId}`);
  const data = await res.json();
  return data.purchase;
}

export async function listPurchases() {
  const res = await apiRequest("/api/purchases");
  const data = await res.json();
  return data.purchases;
}

export async function getBrief(briefId: string) {
  const res = await apiRequest(`/api/site/briefs/${briefId}`);
  const data = await res.json();
  return data;
}

export async function patchBrief(
  briefId: string,
  updates: Record<string, unknown>,
) {
  const res = await apiRequest(`/api/site/briefs/${briefId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  return data;
}

export async function analyzeSite(body: {
  description: string;
  businessName: string;
  industry?: string;
  location?: string;
  brandColors?: string[];
}) {
  const res = await apiRequest("/api/site/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data;
}

export async function shareProject(id: string, visibility: "public" | "unlisted" = "unlisted") {
  const res = await apiRequest(`/api/projects/${id}/share`, {
    method: "POST",
    body: JSON.stringify({ visibility }),
  });
  const data = await res.json();
  return data as { project: ApiProject; shareUrl: string };
}

export async function revokeShare(id: string) {
  await apiRequest(`/api/projects/${id}/share`, { method: "DELETE" });
}

export async function listVersions(id: string) {
  const res = await apiRequest(`/api/projects/${id}/versions`);
  const data = await res.json();
  return data.versions as { id: string; version_number: number; name: string; stage: string; created_at: string }[];
}

export async function saveVersion(id: string) {
  const res = await apiRequest(`/api/projects/${id}/versions`, { method: "POST" });
  const data = await res.json();
  return data.version;
}

export async function restoreVersion(id: string, version: number) {
  const res = await apiRequest(`/api/projects/${id}/versions/${version}/restore`, { method: "POST" });
  const data = await res.json();
  return data.project as ApiProject;
}

export async function getSharedProject(token: string) {
  const res = await apiRequest(`/api/share/${token}`);
  const data = await res.json();
  return data.project as ApiProject;
}

export async function generateSpreadsheet(businessName: string) {
  const res = await apiRequest("/api/spreadsheet/generate", {
    method: "POST",
    body: JSON.stringify({ businessName }),
  });
  return res.json();
}

export async function generateSocialKit(body: { businessName: string; industry?: string; description?: string; tone?: string }) {
  const res = await apiRequest("/api/social-kit/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function healthCheck() {
  const res = await apiRequest("/health");
  return res.json();
}
