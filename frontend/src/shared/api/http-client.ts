export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function readApiError(payload: unknown, status: number): ApiClientError {
  const response = payload as ApiErrorPayload | null;
  return new ApiClientError(
    response?.error?.message ?? "请求失败，请稍后重试。",
    response?.error?.code ?? "REQUEST_FAILED",
    status
  );
}
