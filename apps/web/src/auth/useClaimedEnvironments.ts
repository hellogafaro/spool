import { useAuth } from "@workos-inc/authkit-react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getClaimedEnvironmentIds } from "./pairing";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

export function useClaimedEnvironments(): UseQueryResult<ReadonlyArray<string>, Error> {
  const auth = useAuth();
  const isSignedIn = !!auth.user;

  return useQuery<ReadonlyArray<string>, Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < 3,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return [];
      return await getClaimedEnvironmentIds(token);
    },
  });
}
