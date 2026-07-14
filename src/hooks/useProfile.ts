import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { resizeImage } from '../lib/image';
import type { Profile } from '../types';

const SITE_URL = 'https://progressive-overloadtracker.vercel.app';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // raw input cap; client resizes before upload
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export interface StatsPayload {
  current: number;
  longest: number;
  total: number;
  consistency: number | null;
}

export function useProfile(userId: string, displayNameSeed: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Returns null on success, or an error string.
  async function createProfile(username: string): Promise<string | null> {
    const clean = username.trim().toLowerCase();
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: clean,
        display_name: displayNameSeed.trim() || clean,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') return 'That username is taken.';
      return error.message;
    }
    setProfile(data as Profile);
    return null;
  }

  // Push client-computed stats into user_stats (source of truth is the client,
  // since routines/schedule live in localStorage). Best-effort, non-fatal.
  const pushStats = useCallback(async (s: StatsPayload) => {
    try {
      await supabase.rpc('set_my_stats', {
        p_current: s.current,
        p_longest: s.longest,
        p_total: s.total,
        p_consistency: s.consistency,
      });
    } catch {
      // non-fatal — leaderboard just shows a slightly stale number
    }
  }, []);

  // avatarUrl is either "preset:<key>" or a public storage URL.
  async function setAvatar(avatarUrl: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId)
      .select('*')
      .single();
    if (error) return error.message;
    setProfile(data as Profile);
    return null;
  }

  // Resize client-side, upload to the per-user "avatars" storage path, then
  // point the profile at the resulting public URL. Returns null on success.
  async function uploadAvatarFile(file: File): Promise<string | null> {
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return 'Unsupported image type.';
    if (file.size > MAX_UPLOAD_BYTES) return 'Image is too large (max 8MB).';

    let blob: Blob, ext: string;
    try {
      ({ blob, ext } = await resizeImage(file));
    } catch {
      return 'Could not process that image.';
    }

    // Best-effort cleanup of a previous upload under a different extension.
    const otherExt = ext === 'png' ? 'jpg' : 'png';
    await supabase.storage.from('avatars').remove([`${userId}/avatar.${otherExt}`]);

    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) return uploadError.message;

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a re-upload to the same path shows immediately.
    return setAvatar(`${pub.publicUrl}?v=${Date.now()}`);
  }

  // Returns null on success, or an error string.
  async function updateBio(bio: string): Promise<string | null> {
    const clean = bio.trim();
    const { data, error } = await supabase
      .from('profiles')
      .update({ bio: clean.length ? clean : null })
      .eq('id', userId)
      .select('*')
      .single();
    if (error) return error.message;
    setProfile(data as Profile);
    return null;
  }

  const inviteCode = profile?.invite_code ?? '';
  const inviteUrl = inviteCode ? `${SITE_URL}/invite/${inviteCode}` : '';

  return {
    profile,
    loading,
    needsUsername: !loading && !profile,
    createProfile,
    pushStats,
    setAvatar,
    uploadAvatarFile,
    updateBio,
    inviteCode,
    inviteUrl,
    reload: load,
  };
}
