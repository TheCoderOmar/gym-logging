"""Compressed exercise animations for the iPhone app: 160x160 animated WebP, low quality,
written to mobile-media/<id>.webp (gitignored) from the media in the database.

Re-runnable: existing files are skipped unless --force. Reads the DB read-only.

    python scripts/make-mobile-media.py [--force] [--db path/to/gym.sqlite]
"""
import io
import os
import sqlite3
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'mobile-media')
SIZE = 160
QUALITY = 45


def frames_on_white(im):
    frames, durations = [], []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        fr = im.convert('RGBA')
        bg = Image.new('RGBA', fr.size, (255, 255, 255, 255))
        frames.append(Image.alpha_composite(bg, fr).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS))
        durations.append(im.info.get('duration') or 100)
    return frames, durations


def main():
    force = '--force' in sys.argv
    db = sys.argv[sys.argv.index('--db') + 1] if '--db' in sys.argv else os.environ.get('GYM_DB') or os.path.join(ROOT, 'db', 'gym.sqlite')
    os.makedirs(OUT, exist_ok=True)
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    ids = [r[0] for r in con.execute('SELECT exercise_id FROM exercise_media WHERE gif IS NOT NULL ORDER BY exercise_id')]
    made = skipped = failed = 0
    total = 0
    for n, eid in enumerate(ids, 1):
        out = os.path.join(OUT, f'{eid}.webp')
        if os.path.exists(out) and not force:
            skipped += 1
            total += os.path.getsize(out)
            continue
        (blob,) = con.execute('SELECT gif FROM exercise_media WHERE exercise_id = ?', (eid,)).fetchone()
        try:
            frames, durations = frames_on_white(Image.open(io.BytesIO(blob)))
            frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0,
                           quality=QUALITY, method=4)
            total += os.path.getsize(out)
            made += 1
        except Exception as err:
            print(f'  ! {eid}: {err}')
            failed += 1
        if n % 250 == 0:
            print(f'  {n}/{len(ids)}', flush=True)
    print(f'Done: {made} made, {skipped} already there, {failed} failed — {total / 1e6:.0f} MB in mobile-media/')


if __name__ == '__main__':
    sys.exit(main())
