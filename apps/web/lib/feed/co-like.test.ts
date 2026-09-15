import { describe, expect, it } from 'vitest';
import { type CoLikeRow, coLikeScores } from './co-like';

const like = (install: string, card: string): CoLikeRow => ({
  install_id: install,
  card_id: card,
});

describe('coLikeScores', () => {
  it('scores what co-likers liked, never the seeds themselves', () => {
    const rows = [
      // Buyer u1 shares seed `a` and also liked `b` and `c`.
      like('u1', 'a'),
      like('u1', 'b'),
      like('u1', 'c'),
      // Buyer u2 shares seed `a` and also liked `b`.
      like('u2', 'a'),
      like('u2', 'b'),
      // Buyer u3 shares nothing — their likes must not leak in.
      like('u3', 'z'),
    ];
    const scores = coLikeScores(rows, ['a']);
    expect(scores.a).toBeUndefined();
    expect(scores.z).toBeUndefined();
    // `b` was co-liked twice, `c` once — b leads, and the top score is 1.
    expect(scores.b).toBe(1);
    expect(scores.c).toBeDefined();
    expect(scores.c as number).toBeLessThan(1);
  });

  it('damps candidates that everybody likes', () => {
    const rows = [
      like('u1', 'a'),
      like('u1', 'niche'),
      like('u1', 'hit'),
      // `hit` is liked by many installs that share no seed — popularity
      // damping keeps it from outranking the niche co-like.
      like('u2', 'hit'),
      like('u3', 'hit'),
      like('u4', 'hit'),
    ];
    const scores = coLikeScores(rows, ['a']);
    expect(scores.niche).toBe(1);
    expect(scores.hit as number).toBeLessThan(1);
  });

  it('a re-sent like counts once — the log is at-least-once', () => {
    const rows = [
      like('u1', 'a'),
      like('u1', 'b'),
      like('u1', 'b'),
      like('u2', 'a'),
      like('u2', 'c'),
    ];
    const scores = coLikeScores(rows, ['a']);
    expect(scores.b).toBe(scores.c);
  });

  it('returns nothing when nobody overlaps', () => {
    expect(coLikeScores([like('u1', 'x')], ['a'])).toEqual({});
    expect(coLikeScores([], ['a'])).toEqual({});
  });

  it('caps the neighbour list', () => {
    const rows: CoLikeRow[] = [like('u1', 'a')];
    for (let i = 0; i < 10; i++) rows.push(like('u1', `n${i}`));
    const scores = coLikeScores(rows, ['a'], 3);
    expect(Object.keys(scores)).toHaveLength(3);
  });
});
