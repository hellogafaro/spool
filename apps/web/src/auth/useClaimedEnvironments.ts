import { useAuth } from "@workos-inc/authkit-react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getClaimedEnvironments, type ClaimedEnvironmentsSnapshot } from "./pairing";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

const EMPTY_SNAPSHOT: ClaimedEnvironmentsSnapshot = {
  environmentIds: [],
  environments: [],
};

export function useClaimedEnvironments(): UseQueryResult<ClaimedEnvironmentsSnapshot, Error> {
  const auth = useAuth();
  const isSignedIn = !!auth.user;

  return useQuery<ClaimedEnvironmentsSnapshot, Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < 3,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return EMPTY_SNAPSHOT;
      return await getClaimedEnvironments(token);
    },
  });
}
