import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CommunityReaction = "pass" | "love";

export type CommunityShitlistRow = {
  cardId: string;
  totalVotes: number;
  rejects: number;
  rejectionRate: number;
};

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? "",
).trim();

export const communityConfigured = Boolean(supabaseUrl && supabaseKey);

let client: SupabaseClient | null = null;

function communityClient() {
  if (!communityConfigured) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

async function authenticatedClient() {
  const supabase = communityClient();
  if (!supabase) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  return supabase;
}

export async function castCommunityVote(cardId: string, reaction: CommunityReaction) {
  const supabase = await authenticatedClient();
  if (!supabase) return false;
  const { error } = await supabase.rpc("cast_commander_vote", {
    p_card_id: cardId,
    p_reaction: reaction,
  });
  if (error) throw error;
  return true;
}

export async function fetchCommunityShitlist(): Promise<CommunityShitlistRow[]> {
  const supabase = communityClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_community_shitlist");
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row) => ({
    cardId: String(row.card_id),
    totalVotes: Number(row.total_votes),
    rejects: Number(row.rejects),
    rejectionRate: Number(row.rejection_rate),
  }));
}
