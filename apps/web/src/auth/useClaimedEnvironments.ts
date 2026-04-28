import { useAuth } from "@workos-inc/authkit-react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getSavedEnvs, type SavedEnvRecord } from "./savedEnvApi";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "savedEnvironments"] as const;

/**
 * Returns the env IDs the signed-in user has saved on the Worker. Backed
 * by GET /env on the Trunk Worker, which reads from WorkOS Vault.
 */
export function useClaimedEnvironments(): UseQueryResult<ReadonlyArray<string>, Error> {
  const auth = useAuth();
  const isSignedIn = !!auth.user;

  return useQuery<ReadonlyArray<string>, Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return [];
      const records: ReadonlyArray<SavedEnvRecord> = await getSavedEnvs(token);
      return records.map((record) => record.environmentId);
    },
  });
}
