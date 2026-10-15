"""Match crawled liftmanual.com exercises to the ones already in data/exercises.json.

Both sites use the same Gym visual animations, so the main signal is the picture: the first
animation frame of each exercise is shrunk to a 256-bit perceptual hash (dHash) and compared
with every local GIF. Name similarity is the second signal.

Writes scrape/liftmanual/matches.json: one entry per liftmanual exercise with
  status 'match'     same animation (or, failing that, exactly the same name) as a local exercise
                     (→ swap in the sharper media)
         'duplicate' same animation as another liftmanual entry already matched/kept (skip)
         'new'       no local exercise has this animation (→ import as a new exercise)
         'no-media'  page had no animation (skip)

Needs Python 3 + Pillow.   python scripts/match-liftmanual.py
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LM = os.path.join(ROOT, 'scrape', 'liftmanual')
SAME = 8    # max Hamming distance (of 256 bits) for "same animation" on the picture alone
NEAR = 20   # up to here it's the same exercise only if the names agree too
# (Calibrated on the first 50: real matches sit at 0–12 with matching names; false ones at 20+ with unrelated names.)


def first_frame(path):
    im = Image.open(path)
    im.seek(0)
    fr = im.convert('RGBA')
    bg = Image.new('RGBA', fr.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, fr).convert('L')


def dhash(img):
    small = img.resize((17, 16), Image.LANCZOS)
    px = list(small.getdata())
    bits = 0
    for y in range(16):
        for x in range(16):
            bits = (bits << 1) | (px[y * 17 + x] > px[y * 17 + x + 1])
    return bits


def norm(name):
    n = name.lower().replace('&', ' and ')
    n = re.sub(r'\bv\.? ?(\d)\b', r'v\1', n)
    n = re.sub(r'[^a-z0-9]+', ' ', n)
    return ' '.join(n.split())


def tokens(name):
    return set(norm(name).split())


def main():
    local = json.load(open(os.path.join(ROOT, 'data', 'exercises.json'), encoding='utf8'))
    hashes_file = os.path.join(LM, 'local-hashes.json')
    cache = json.load(open(hashes_file)) if os.path.exists(hashes_file) else {}
    for ex in local:
        if ex['id'] in cache or not ex.get('gif_url'):
            continue
        path = os.path.join(ROOT, ex['gif_url'])
        if os.path.exists(path):
            cache[ex['id']] = dhash(first_frame(path))
    json.dump(cache, open(hashes_file, 'w'))
    local_by_id = {e['id']: e for e in local}
    local_norm = {norm(e['name']): e['id'] for e in local}
    print(f'{len(cache)} local animations fingerprinted')

    crawled = json.load(open(os.path.join(LM, 'exercises.json'), encoding='utf8'))
    out = []
    hashes = {}
    for ex in crawled:
        rec = {'slug': ex['slug'], 'name': ex['name']}
        media = os.path.join(LM, 'media', ex.get('animFile') or '')
        if not ex.get('animFile') or not os.path.exists(media):
            rec['status'] = 'no-media'
            out.append(rec)
            continue
        try:
            h = dhash(first_frame(media))
        except Exception as err:  # broken download
            rec.update(status='no-media', error=str(err))
            out.append(rec)
            continue
        hashes[ex['slug']] = h
        best_id, best_d = None, 999
        for lid, lh in cache.items():
            d = bin(h ^ lh).count('1')
            if d < best_d:
                best_id, best_d = lid, d
        a, b = tokens(ex['name']), tokens(local_by_id[best_id]['name'])
        jac = len(a & b) / max(1, len(a | b))
        same = best_d <= SAME or (best_d <= NEAR and (local_norm.get(norm(ex['name'])) == best_id or jac >= 0.6))
        rec.update(distance=best_d, closest=best_id, closest_name=local_by_id[best_id]['name'], name_overlap=round(jac, 2), same=same)
        out.append(rec)

    # Each local exercise goes to the liftmanual entry with the closest picture; other entries
    # showing the same animation are duplicates.
    winner = {}
    for r in out:
        if r.get('same') and (r['closest'] not in winner or r['distance'] < winner[r['closest']]['distance']):
            winner[r['closest']] = r
    kept_new = []
    for r in out:
        if 'same' not in r:
            continue
        if r['same']:
            w = winner[r['closest']]
            r.update(status='match', id=r['closest']) if w is r else r.update(status='duplicate', of=w['slug'])
        elif local_norm.get(norm(r['name'])) and local_norm[norm(r['name'])] not in winner:
            # Same name as a local exercise, different drawing: still the same exercise.
            r.update(status='match', id=local_norm[norm(r['name'])], by='name')
            winner[r['id']] = r
        else:
            h = hashes[r['slug']]
            dup = next((k for k in kept_new if bin(h ^ hashes[k]).count('1') <= SAME), None)
            if dup:
                r.update(status='duplicate', of=dup)
            else:
                kept_new.append(r['slug'])
                r['status'] = 'new'
        del r['same']
    claimed = winner

    # Still image (first frame on white) for every exercise that will be imported.
    for r in out:
        if r['status'] in ('match', 'new'):
            still = os.path.join(LM, 'media', r['slug'] + '.jpg')
            if not os.path.exists(still):
                im = Image.open(os.path.join(LM, 'media', next(e['animFile'] for e in crawled if e['slug'] == r['slug'])))
                im.seek(0)
                fr = im.convert('RGBA')
                bg = Image.new('RGBA', fr.size, (255, 255, 255, 255))
                Image.alpha_composite(bg, fr).convert('RGB').save(still, quality=88)

    json.dump(out, open(os.path.join(LM, 'matches.json'), 'w', encoding='utf8'), indent=1, ensure_ascii=False)
    counts = {}
    for r in out:
        counts[r['status']] = counts.get(r['status'], 0) + 1
    print(counts, '| local exercises with a sharper version:', len(claimed), 'of', len(local))


if __name__ == '__main__':
    sys.exit(main())
