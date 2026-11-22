"""Opzionale: python -B preprocessing/poligoni.py src/manuscripts/NOME."""
import argparse
import re
from pathlib import Path
from xml.etree import ElementTree as ET


def quadrilateral(coords, baseline):
    points = [tuple(map(float, p.split(','))) for p in coords.split()]
    base = [tuple(map(float, p.split(','))) for p in baseline.split()]
    (x1, y1), (x2, y2) = base[0], base[-1]
    if x1 == x2:
        raise ValueError('baseline verticale o priva di estensione')
    if x1 > x2:
        x1, y1, x2, y2 = x2, y2, x1, y1
    slope = (y2-y1)/(x2-x1)
    middle = (x1+x2)/2
    heights = [y-slope*(x-middle) for x, y in points]
    top, bottom = min(heights), max(heights)
    return ' '.join(f'{x:g},{y:g}' for x, y in
                    [(x1, top+slope*(x1-middle)), (x2, top+slope*(x2-middle)),
                     (x2, bottom+slope*(x2-middle)), (x1, bottom+slope*(x1-middle))])


def normalize_folder(folder):
    folder = folder.resolve()
    root = Path(__file__).resolve().parents[1] / 'src/manuscripts'
    if not folder.is_relative_to(root.resolve()) or not (folder/'xml').is_dir():
        raise ValueError('Specificare una collezione con xml/ dentro src/manuscripts/.')
    paths = sorted((folder/'xml').glob('*.xml'))
    backup = folder/'old-xml'
    backup.mkdir(exist_ok=True)
    # Tutti i backup precedono qualsiasi modifica. "xb" non sovrascrive mai.
    for path in paths:
        try:
            with (backup/path.name).open('xb') as handle:
                handle.write(path.read_bytes())
        except FileExistsError:
            pass
    for path in paths:
        raw = path.read_bytes()
        if re.search(br'<!ENTITY\b|<!DOCTYPE[^>]*\[', raw, re.I):
            raise ValueError(f'Dichiarazioni di entità non ammesse: {path}')
        ET.fromstring(raw)
        count = 0

        def replace_line(match):
            nonlocal count
            line = match[0]
            # Rimuove soltanto gli spazi esterni al testo, riallineando gli offset PAGE.
            unicode = re.search(br'<(?:\w+:)?Unicode\b[^>]*>(.*?)</(?:\w+:)?Unicode\s*>', line, re.S)
            if unicode:
                value = unicode[1].decode('utf-8')
                leading = len(value) - len(value.lstrip())
                line = line[:unicode.start(1)] + value.strip().encode('utf-8') + line[unicode.end(1):]
                if leading:
                    line = re.sub(br'\boffset\s*:\s*(\d+)',
                                  lambda m: b'offset:'+str(max(0, int(m[1])-leading)).encode(), line)
            coords = re.search(br'<(?:\w+:)?Coords\b[^>]*\bpoints=([\x22\x27])(.*?)\1', line)
            base = re.search(br'<(?:\w+:)?Baseline\b[^>]*\bpoints=([\x22\x27])(.*?)\1', line)
            if not coords or not base:
                return line
            try:
                value = quadrilateral(coords[2].decode(), base[2].decode()).encode()
            except (ValueError, IndexError) as error:
                print(f'{path.name}: riga lasciata invariata ({error})')
                return line
            count += 1
            return line[:coords.start(2)]+value+line[coords.end(2):]

        # Coordinate e spazi esterni al testo; la baseline resta invariata.
        updated = re.sub(br'<(?:\w+:)?TextLine\b[^>]*>.*?</(?:\w+:)?TextLine\s*>', replace_line, raw, flags=re.S)
        ET.fromstring(updated)
        path.write_bytes(updated)
        print(f'{path.name}: {count} poligoni')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('collection', type=Path)
    normalize_folder(parser.parse_args().collection)
