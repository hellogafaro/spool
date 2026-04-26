import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchClaimedEnvironmentIds } from "./pairingApi";
import { useTrunkAuth } from "./workos";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

export function useClaimedEnvironments(): UseQueryResult<readonly string[], Error> {
  const auth = useTrunkAuth();
  const isSignedIn = auth.status === "signed-in";

  return useQuery<readonly string[], Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return [];
      return await fetchClaimedEnvironmentIds(token);
    },
  });
}
