import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Profile = { id: string; display_name: string; company_name: string };

export const profileQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, company_name")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { id: userId, display_name: "", company_name: "" };
    },
  });
