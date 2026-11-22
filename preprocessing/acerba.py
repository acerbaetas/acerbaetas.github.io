"""Crespi + collezioni PAGE -> un JSON Crespi e tre JSON per manoscritto."""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/acerba'


def xml(path):
    raw = path.read_bytes()
    if re.search(br'<!ENTITY\b|<!DOCTYPE[^>]*\[', raw, re.I):
        raise ValueError(f'Dichiarazioni di entità non ammesse: {path}')
    return ET.fromstring(raw)  # Non scarica il DTD esterno di TEI.2.


def text(element):
    return ''.join(element.itertext()).strip() if element is not None else ''


def natural(value):
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', str(value))]


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.lower()) if c.isalpha())


def levenshtein(a, b):
    """Distanza esatta, con una sola riga di memoria."""
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        following = [i]
        for j, cb in enumerate(b, 1):
            following.append(min(following[-1] + 1, row[j] + 1, row[j-1] + (ca != cb)))
        row = following
    return row[-1]


def custom(raw):
    result = []
    for tag, body in re.findall(r'(\w+)\s*\{([^{}]*)\}', raw):
        props = dict(part.strip().split(':', 1) for part in body.split(';') if ':' in part)
        props = {k: re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m[1], 16)), v.strip())
                 for k, v in props.items()}
        result.append((tag, props))
    return result


def read_crespi(path):
    root = xml(path)
    books = []
    for bi, book in enumerate(root.findall('.//body/div1'), 1):
        chapters = []
        for ci, chapter in enumerate(book.findall('div2') or [book], 1):
            cid = f'{bi}-{ci}'
            chapters.append({'id': cid, 'title': 'Frammenti' if bi == 5 else text(chapter.find('head')),
                             'description': ' '.join(text(chapter.find('argument')).split()),
                             'verses': [{'id': f'{cid}-{vi}', 'text': text(line)}
                                        for vi, line in enumerate(chapter.findall('.//l'), 1)]})
        books.append({'id': str(bi), 'title': text(book.find('head')), 'chapters': chapters})
    return {'title': 'Edizione Crespi 1927', 'books': books}


def read_pages(folder):
    pages, lines = [], []
    for path in sorted((folder / 'xml').glob('*.xml'), key=lambda p: natural(p.name)):
        root = xml(path)
        ns = {'p': root.tag.split('}')[0][1:]}
        page = root.find('p:Page', ns)
        filename = page.get('imageFilename')
        image = folder / 'img' / filename
        if not image.resolve().is_relative_to((folder / 'img').resolve()):
            raise ValueError(f'Immagine fuori da img/: {filename}')
        label = re.search(r'Carta-_(.+)\.[^.]+$', filename)
        pages.append({'id': path.stem, 'label': label[1] if label else filename,
                      'image': image.relative_to(ROOT).as_posix() if image.is_file() else None,
                      'width': int(page.get('imageWidth')), 'height': int(page.get('imageHeight')),
                      'first': None, 'regions': []})
        if not image.is_file():
            print(f'Immagine assente: {image}')
        region_order = {e.get('regionRef'): int(e.get('index'))
                        for e in page.findall('.//p:RegionRefIndexed', ns)}

        def order(element):
            return next((int(p['index']) for tag, p in custom(element.get('custom', ''))
                         if tag == 'readingOrder'), 0)

        for region in sorted(page.findall('.//p:TextRegion', ns),
                             key=lambda e: region_order.get(e.get('id'), order(e))):
            for line in sorted(region.findall('p:TextLine', ns), key=order):
                equiv = sorted(line.findall('p:TextEquiv', ns), key=lambda e: int(e.get('index', 0)))
                value = equiv[0].findtext('p:Unicode', '', ns) if equiv else ''
                coords = line.find('p:Coords', ns)
                tags = custom(line.get('custom', ''))
                annotations = []
                for tag, props in tags:
                    if tag not in ('uncertain', 'differentReading', 'person', 'place', 'planet', 'animal', 'stone', 'virtue'):
                        continue
                    start, length = int(props.get('offset', -1)), int(props.get('length', 0))
                    if 0 <= start < start+length <= len(value):
                        annotations.append({'type': tag, 'start': start, 'length': length})
                    else:
                        print(f'Intervallo ignorato: {path.name}, {line.get("id")}, {tag}')
                lines.append({'text': value, 'page': path.stem, 'annotations': annotations,
                              'points': coords.get('points') if coords is not None else '', 'tags': tags,
                              'header': bool(re.search(r'^(incipit|explicit|capitul\w*|libro\b|liber\b)', value, re.I))
                              or any(t in ('heading', 'header') or p.get('type') in ('heading', 'header')
                                     for t, p in custom(region.get('custom', '')) + tags)})
    return pages, lines


def align(lines, verses):
    """Levenshtein + peso dell'ordine, non vincolo. Trigrammi per ridurre i confronti."""
    normalized = [normalize(v['text']) for v in verses]
    grams = lambda s: set(s[i:i+3] for i in range(len(s)-2))
    lookup = defaultdict(set)
    for j, value in enumerate(normalized):
        for gram in grams(value):
            lookup[gram].add(j)

    def best(i, cursor):
        choices = []
        for count in (1, 2):
            if i+count > len(lines) or (count == 2 and lines[i+1]['header']):
                continue
            value = normalize(''.join(l['text'] for l in lines[i:i+count]))
            votes = Counter(j for gram in grams(value) for j in lookup[gram])
            candidates = {j for j, _ in votes.most_common(24)} | set(range(max(0,cursor-6), min(len(verses),cursor+12)))
            for j in sorted(candidates):
                for size in (1, 2) if count == 1 else (1,):
                    if j+size > len(verses) or verses[j]['id'].rsplit('-', 1)[0] != verses[j+size-1]['id'].rsplit('-', 1)[0]:
                        continue
                    target = ''.join(normalized[j:j+size])
                    if not value or min(len(value),len(target))/max(len(value),len(target)) < .5:
                        continue
                    similarity = 1 - levenshtein(value, target)/max(len(value), len(target))
                    score = similarity - .10*min(abs(j-cursor),30)/30 - .07*(count+size-2)
                    choices.append((score, similarity, count, j, size))
        choices.sort(reverse=True)
        return choices

    result, cursor, i, header = [], 0, 0, []
    while i < len(lines):
        if lines[i]['header']:
            header.append(lines[i]); i += 1; continue
        choices = best(i, cursor)
        score, similarity, count, j, size = choices[0] if choices else (0, 0, 1, min(cursor,len(verses)-1), 1)
        if header and similarity < .76:
            header.append(lines[i]); i += 1; continue
        cid = verses[j]['id'].rsplit('-', 1)[0] if similarity >= .62 else verses[min(cursor,len(verses)-1)]['id'].rsplit('-', 1)[0]
        if header:
            result.append({'kind': 'header', 'chapter': cid, 'lines': header})
            header = []
        other = next((c[0] for c in choices[1:] if c[3] != j), -1)
        status = 'aligned' if similarity >= .60 and score-other >= .1 else 'uncertain' if similarity >= .20 else 'unmatched'
        if status == 'unmatched':
            count, size = 1, 0
        result.append({'kind': 'verse', 'chapter': cid, 'status': status,
                       'matches': [v['id'] for v in verses[j:j+size]], 'lines': lines[i:i+count]})
        if status == 'aligned':
            cursor = j+size
        i += count
    if header:
        cid = verses[min(cursor,len(verses)-1)]['id'].rsplit('-', 1)[0]
        result.append({'kind': 'header', 'chapter': cid, 'lines': header})
    return result


def manuscript(folder, edition):
    wid = re.sub(r'[^a-z0-9]+', '-', folder.name.lower()).strip('-')
    pages, lines = read_pages(folder)
    verses = [v for b in edition['books'] for c in b['chapters'] for v in c['verses']]
    blocks = align(lines, verses)
    headers, extras = Counter(), Counter()
    entities, by_chapter = {}, defaultdict(list)
    page_map = {p['id']: p for p in pages}
    used = set()
    for position, block in enumerate(blocks):
        cid = block['chapter']
        if block['kind'] == 'header':
            headers[cid] += 1
            ref = f'{cid}-h' + (str(headers[cid]) if headers[cid] > 1 else '')
        else:
            if block['status'] == 'aligned' and used.intersection(block['matches']):
                block['status'] = 'uncertain'
            if block['status'] == 'aligned':
                ref = block['matches'][0]; used.update(block['matches'])
            else:
                extras[cid] += 1
                ref = f'{wid}:{cid}-u{extras[cid]}'
        item = {'id': ref, 'kind': block['kind'], 'order': position, 'lines': []}
        if block['kind'] == 'verse':
            item.update(status=block['status'], matches=block['matches'])
        for line in block['lines']:
            item['lines'].append({k: line[k] for k in ('text', 'page', 'annotations')})
            page = page_map[line['page']]
            if page['first'] is None:
                page['first'] = ref
            region = {'ref': ref, 'points': line['points']}
            if block.get('status') == 'aligned' and len(block['matches']) > 1:
                region['also'] = block['matches'][1:]
            page['regions'].append(region)
            for tag, props in line['tags']:
                if tag not in ('person', 'place', 'planet', 'animal', 'stone', 'virtue'):
                    continue
                name = ' '.join(filter(None, [props.get('firstname'), props.get('lastname')]))
                name = name or props.get('placeName') or props.get('name') or props.get('country')
                start, length = int(props.get('offset', 0)), int(props.get('length', 0))
                name = name or line['text'][start:start+length]
                qid = props.get('wikiData', '')
                qid = qid if re.fullmatch(r'Q[1-9]\d*', qid) else None
                key = tag + ':' + (qid or name)
                if key not in entities:
                    labels = {'dateOfBirth': 'Nascita', 'dateOfDeath': 'Morte', 'country': 'Paese', 'description': ''}
                    description = '; '.join((labels[k]+': ' if labels[k] else '')+props[k] for k in labels if props.get(k))
                    entities[key] = {'id': key, 'type': tag, 'name': name, 'description': description,
                                     'wikidata': qid, 'occurrences': []}
                occurrences = entities[key]['occurrences']
                if not any(o['ref'] == ref for o in occurrences):
                    occurrences.append({'ref': ref, 'order': position})
        by_chapter[cid].append(item)
    books = [{'id': b['id'], 'title': b['title'],
              'chapters': [{'id': c['id'], 'title': c['title'], 'blocks': by_chapter[c['id']]}
                           for c in b['chapters'] if c['id'] in by_chapter]}
             for b in edition['books'] if any(c['id'] in by_chapter for c in b['chapters'])]
    write(wid+'-trascrizione.json', {'books': books})
    write(wid+'-immagini.json', {'pages': pages})
    write(wid+'-entita.json', {'entities': list(entities.values())})
    print(f'{folder.name}: {len(pages)} pagine, {len(lines)} righe; {dict(Counter(b.get("status", "header") for b in blocks))}')
    return {'id': wid, 'title': folder.name.replace('_', ' ')}


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    edition = read_crespi(ROOT / 'src/Acerba_AchilleCrespi_1927')
    folders = sorted((ROOT / 'src/manuscripts').iterdir(), key=lambda p: natural(p.name))
    edition['manuscripts'] = [manuscript(f, edition) for f in folders if f.is_dir() and (f/'xml').is_dir()]
    write('crespi.json', edition)
    expected = {'crespi.json'} | {w['id']+'-'+kind+'.json' for w in edition['manuscripts']
                                 for kind in ('trascrizione', 'immagini', 'entita')}
    for path in OUT.glob('*.json'):
        if path.name not in expected:
            path.unlink()
    print(f'{len(expected)} JSON finali in {OUT}')


if __name__ == '__main__':
    main()
