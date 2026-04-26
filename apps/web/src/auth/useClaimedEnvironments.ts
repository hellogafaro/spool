import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchClaimedEnvironments,
  type ClaimedEnvironmentsSnapshot,
} from "./pairingApi";
import { useAuth } from "./workos";

export const CLAIMED_ENVIRONMENTS_QUERY_KEY = ["trunk", "claimedEnvironments"] as const;

const EMPTY_SNAPSHOT: ClaimedEnvironmentsSnapshot = {
  environmentIds: [],
  environments: [],
};

export function useClaimedEnvironments(): UseQueryResult<ClaimedEnvironmentsSnapshot, Error> {
  const auth = useAuth();
  const isSignedIn = auth.status === "signed-in";

  return useQuery<ClaimedEnvironmentsSnapshot, Error>({
    queryKey: CLAIMED_ENVIRONMENTS_QUERY_KEY,
    enabled: isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < 3,
    queryFn: async () => {
      const token = await auth.getAccessToken();
      if (!token) return EMPTY_SNAPSHOT;
      return await fetchClaimedEnvironments(token);
    },
  });
}
