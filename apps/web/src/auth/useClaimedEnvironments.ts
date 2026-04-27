import { useAuth } from "@workos-inc/authkit-react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getClaimedEnvironmentIds } from "./pairing";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

/**
 * Returns the env IDs the signed-in user owns. The list lives in the
 * WorkOS access token under the `environmentIds` custom claim (set via
 * the JWT template in the WorkOS Dashboard), so reading it is just a
 * decode of the bearer — no relay round-trip.
 *
 * Wrapped in TanStack Query so consumers can `refetch()` after pairing
 * to pick up the freshly-rotated session.
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
      return getClaimedEnvironmentIds(token);
    },
  });
}
