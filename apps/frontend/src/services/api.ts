export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error || "Something went wrong.", response.status);
  return data as T;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export async function waitForJob(id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = await api<{
      status: string;
      error?: string;
      result?: { quizId?: string; interventionId?: string };
    }>("/teacher/jobs/" + id);
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed")
      throw new Error(job.error || "Agent task failed.");
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(
    "The task is still processing. Check Agent activity for its status.",
  );
}
