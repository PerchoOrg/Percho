'use client';

/**
 * AvatarPicker — Phase 27 (2026-06-14).
 *
 * Shared avatar editor for both agents and buyers. Three sources:
 *   1. Six system-provided house presets (`/avatars/preset-N.svg`).
 *   2. Upload from device → react-easy-crop square → 256×256 WebP →
 *      Supabase Storage `avatars` bucket at `{user_id}/{uuid}.webp`.
 *   3. Remove (sets the column back to NULL → caller falls back to the
 *      letter-initial circle).
 *
 * The picker is purely a UI control. Persisting the chosen URL goes
 * through the `updateAvatarUrl` server action (parent owns that call).
 *
 * UX:
 *   - Current avatar shown as a circle. Tap "Change" → modal opens.
 *   - Tabs: Presets / Upload / Remove. Selecting a preset commits
 *     immediately. Upload requires drag/zoom confirm.
 */

import {
  AVATAR_PRESETS,
  AVATARS_BUCKET,
  avatarPublicUrl,
  isPresetAvatar,
  nextAvatarStoragePath,
} from '@/lib/supabase/storage';
import { createClient } from '@/lib/supabase/client';
import { Camera, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { updateAvatarUrl } from '../actions';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OUTPUT_SIZE = 256;
const OUTPUT_TYPE = 'image/webp';
const OUTPUT_QUALITY = 0.9;

type Tab = 'presets' | 'upload';

export function AvatarPicker({
  initialUrl,
  userId,
  fallbackLetter,
}: {
  initialUrl: string | null;
  userId: string;
  /** First letter shown when no avatar is set. */
  fallbackLetter: string;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <AvatarCircle url={url} fallbackLetter={fallbackLetter} size={64} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1.5 text-ink2 text-xs hover:border-line-strong hover:text-ink"
      >
        <Camera size={14} aria-hidden="true" />
        Change avatar
      </button>
      {open ? (
        <PickerModal
          userId={userId}
          currentUrl={url}
          onClose={() => setOpen(false)}
          onChange={(next) => {
            setUrl(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function AvatarCircle({
  url,
  fallbackLetter,
  size = 64,
}: {
  url: string | null;
  fallbackLetter: string;
  size?: number;
}) {
  if (url) {
    return (
      // biome-ignore lint/a11y/useAltText: alt is set
      <img
        src={url}
        alt="Avatar"
        width={size}
        height={size}
        className="rounded-full border border-line-strong bg-surface object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full border border-line-strong bg-surface font-serif text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-label="Avatar"
    >
      {fallbackLetter.toUpperCase()}
    </div>
  );
}

function PickerModal({
  userId,
  currentUrl,
  onClose,
  onChange,
}: {
  userId: string;
  currentUrl: string | null;
  onClose: () => void;
  onChange: (url: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>(isPresetAvatar(currentUrl) ? 'presets' : 'presets');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string | null) {
    setBusy(true);
    setError(null);
    const res = await updateAvatarUrl({ url: next });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onChange(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-line border-b px-4 py-3">
          <div className="font-medium text-ink text-sm">Choose avatar</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-ink2 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex border-line border-b text-xs">
          <TabButton active={tab === 'presets'} onClick={() => setTab('presets')}>
            Presets
          </TabButton>
          <TabButton active={tab === 'upload'} onClick={() => setTab('upload')}>
            Upload
          </TabButton>
        </div>

        <div className="p-4">
          {tab === 'presets' ? (
            <PresetGrid
              currentUrl={currentUrl}
              busy={busy}
              onPick={(presetUrl) => void commit(presetUrl)}
            />
          ) : (
            <UploadCropPanel
              userId={userId}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onUploaded={(publicUrl) => void commit(publicUrl)}
            />
          )}

          {error ? (
            <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
              {error}
            </div>
          ) : null}

          {currentUrl ? (
            <div className="mt-4 border-line border-t pt-3 text-right">
              <button
                type="button"
                onClick={() => void commit(null)}
                disabled={busy}
                className="text-muted text-xs hover:text-rose-300"
              >
                Remove avatar
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-2 transition ${
        active
          ? 'border-line-strong border-b-2 text-ink'
          : 'border-transparent border-b-2 text-muted hover:text-ink2'
      }`}
    >
      {children}
    </button>
  );
}

function PresetGrid({
  currentUrl,
  busy,
  onPick,
}: {
  currentUrl: string | null;
  busy: boolean;
  onPick: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {AVATAR_PRESETS.map((preset) => {
        const selected = currentUrl === preset;
        return (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => onPick(preset)}
            className={`relative aspect-square overflow-hidden rounded-full border-2 bg-bg transition ${
              selected ? 'border-line-strong' : 'border-line hover:border-line'
            }`}
            aria-label="Select preset avatar"
            aria-pressed={selected}
          >
            {/* biome-ignore lint/a11y/useAltText: decorative inside button label */}
            <img src={preset} alt="" className="h-full w-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}

function UploadCropPanel({
  userId,
  busy,
  setBusy,
  setError,
  onUploaded,
}: {
  userId: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_MIMES.has(file.type)) {
      setError('Please pick a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image too large (max 5 MB).');
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function confirm() {
    if (!src || !croppedArea) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderCroppedWebp(src, croppedArea);
      const path = nextAvatarStoragePath(userId);
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, { contentType: OUTPUT_TYPE, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
      onUploaded(avatarPublicUrl(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setBusy(false);
    }
  }

  if (!src) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-line border-dashed bg-bg px-4 py-10 text-ink2 transition hover:border-line-strong hover:text-ink"
        >
          <Upload size={20} aria-hidden="true" />
          <span className="text-sm">Pick an image</span>
          <span className="text-muted text-xs">JPEG, PNG, or WebP · up to 5 MB</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-64 w-full overflow-hidden rounded-lg bg-bg">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <input
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Zoom"
        className="mt-3 w-full accent-[#c9a961]"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSrc(null)}
          disabled={busy}
          className="flex-1 rounded-md border border-line px-3 py-2 text-ink2 text-sm hover:text-ink"
        >
          Pick another
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 font-medium text-cream text-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Saving…' : 'Save avatar'}
        </button>
      </div>
    </div>
  );
}

/**
 * Decode `srcUrl`, crop to `area` (in source pixels), scale to 256×256,
 * and encode as WebP. Pure browser canvas — no server round-trip.
 */
async function renderCroppedWebp(srcUrl: string, area: Area): Promise<Blob> {
  const img = await loadImage(srcUrl);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encode failed.'))),
      OUTPUT_TYPE,
      OUTPUT_QUALITY,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}
