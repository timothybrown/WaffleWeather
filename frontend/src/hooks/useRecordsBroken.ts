import { useMemo } from "react";
import { useGetBrokenRecords } from "@/generated/records/records";
import { CADENCES } from "@/lib/queryCadences";
import type { BrokenRecord } from "@/generated/models";

export interface BrokenRecordsState {
  broken: Record<string, BrokenRecord | null>;
  isLoading: boolean;
}

export function useRecordsBroken(): BrokenRecordsState {
  const { data: response, isLoading } = useGetBrokenRecords(
    {},
    { query: { refetchInterval: CADENCES.aggregate5m } },
  );

  const broken = useMemo(() => {
    const data = response?.data as
      | { broken?: Record<string, BrokenRecord | null> }
      | undefined;
    return data?.broken ?? {};
  }, [response]);

  return { broken, isLoading };
}
