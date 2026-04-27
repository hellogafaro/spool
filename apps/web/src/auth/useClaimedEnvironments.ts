import { useAuth } from "@workos-inc/authkit-react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getClaimedEnvironments, type ClaimedEnvironment } from "./pairing";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

export function useClaimedEnvironments(): UseQueryResult<ReadonlyArray<ClaimedEnvironment>, Error> {
  const auth = useAuth();
  const isSignedIn = !!auth.user;

  return useQuery<ReadonlyArray<ClaimedEnvironment>, Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < 3,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return [];
      return await getClaimedEnvironments(token);
    },
  });
}
