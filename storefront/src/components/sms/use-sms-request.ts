"use client";
import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { smsMessages } from "@/lib/sms-types";
export class SmsRequestError extends Error { constructor(public code: string) { super(smsMessages[code] || "Permintaan SMS belum berhasil. Silakan coba kembali."); } }
export function useSmsRequest() {
  const { getToken } = useAuth();
  return useCallback(async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getToken(attempt ? { skipCache: true } : undefined);
      if (!token) throw new SmsRequestError("sign_in_required");
      const response = await fetch(url, { ...init, cache: "no-store", headers: { ...init.headers, authorization: `Bearer ${token}`, "content-type": "application/json" } });
      const result = await response.json();
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw new SmsRequestError(result.code || "sms_unavailable");
      return result;
    }
    throw new SmsRequestError("sign_in_required");
  }, [getToken]);
}
