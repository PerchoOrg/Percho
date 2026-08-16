import { describe, expect, it, vi } from 'vitest';
import { isOpenRouterHost, parseVideoStatus, submitVideo } from '../openrouter-video';

/**
 * The two decisions in this module that are not just HTTP plumbing:
 * when a poll means "done" (spend a download) and whether a result URL is
 * allowed to see our API key.
 */

describe('parseVideoStatus', () => {
  it('reports completed with the first content URL and usage cost', () => {
    expect(
      parseVideoStatus({
        status: 'completed',
        unsigned_urls: ['https://cdn/a.mp4', 'b.mp4'],
        usage: { cost: 0.24318 },
      }),
    ).toEqual({ status: 'completed', videoUrl: 'https://cdn/a.mp4', costUsd: 0.24318 });
  });

  it('treats missing usage cost as null (not an error)', () => {
    expect(
      parseVideoStatus({ status: 'completed', unsigned_urls: ['https://cdn/a.mp4'] }),
    ).toEqual({ status: 'completed', videoUrl: 'https://cdn/a.mp4', costUsd: null });
  });

  it('treats completed-with-no-URL as a failure, not a success', () => {
    expect(parseVideoStatus({ status: 'completed', unsigned_urls: [] })).toEqual({
      status: 'failed',
      error: 'completed but no video URL returned',
    });
  });

  it('surfaces a string error', () => {
    expect(parseVideoStatus({ status: 'failed', error: 'content policy' })).toEqual({
      status: 'failed',
      error: 'content policy',
    });
  });

  it('treats expired as terminal failure so the row can be regenerated', () => {
    expect(parseVideoStatus({ status: 'expired', error: 'Job exceeded maximum time to live' })).toEqual({
      status: 'failed',
      error: 'Job exceeded maximum time to live',
    });
  });

  it('surfaces an object error via .message', () => {
    expect(parseVideoStatus({ status: 'failed', error: { message: 'quota exceeded' } })).toEqual({
      status: 'failed',
      error: 'quota exceeded',
    });
  });

  it('falls back to a generic message when the error has no shape', () => {
    expect(parseVideoStatus({ status: 'failed' })).toEqual({
      status: 'failed',
      error: 'generation failed',
    });
  });

  it('treats anything else — including a missing status — as still processing', () => {
    expect(parseVideoStatus({ status: 'queued' })).toEqual({ status: 'processing' });
    expect(parseVideoStatus({})).toEqual({ status: 'processing' });
    expect(parseVideoStatus(null)).toEqual({ status: 'processing' });
  });
});

describe('isOpenRouterHost', () => {
  it('accepts openrouter.ai and its subdomains', () => {
    expect(isOpenRouterHost('https://openrouter.ai/api/v1/files/x')).toBe(true);
    expect(isOpenRouterHost('https://cdn.openrouter.ai/x.mp4')).toBe(true);
  });

  it('rejects third-party CDNs and look-alike hosts', () => {
    expect(isOpenRouterHost('https://storage.googleapis.com/x.mp4')).toBe(false);
    expect(isOpenRouterHost('https://notopenrouter.ai/x.mp4')).toBe(false);
    expect(isOpenRouterHost('not a url')).toBe(false);
  });
});

describe('submitVideo request body', () => {
  it('defaults to input_references mode and sends every selected photo as a reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-1', polling_url: 'https://openrouter.ai/api/v1/videos/job-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    try {
      await submitVideo({
        prompt: 'A cinematic clip of the neighborhood.',
        frameImageUrls: ['https://a/frame1.jpg', 'https://a/frame2.jpg', 'https://a/frame3.jpg'],
        durationS: 8,
        aspectRatio: '9:16',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('bytedance/seedance-1-5-pro');
      expect(body.input_references).toHaveLength(3);
      expect(body.input_references[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://a/frame1.jpg' },
      });
      expect(body.frame_images).toBeUndefined();
      expect(body.duration).toBe(8);
      expect(body.aspect_ratio).toBe('9:16');
    } finally {
      vi.unstubAllGlobals();
      process.env.OPENROUTER_API_KEY = undefined;
    }
  });
});
