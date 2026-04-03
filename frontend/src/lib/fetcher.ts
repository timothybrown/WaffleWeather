/**
 * Custom fetcher for Orval-generated API client.
 * Returns { data, status, headers } to match Orval's expected response shape.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const customFetch = async <T>(
  url: string,
  options?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = response.status === 204 ? undefined : await response.json();

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T;
};

export default customFetch;
