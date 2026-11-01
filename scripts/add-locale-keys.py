#!/usr/bin/env python3
"""Add i18n keys to public/locales/*/translation.json without reformatting.

Usage: python3 -I scripts/add-locale-keys.py spec.json
spec.json: {"en": {"calendar.location.copy": "Copy address"}, "fr": {...}, "*": {...}}
"*" applies to every locale that has no value of its own for that key.

Each key goes in as one new line, first child of its parent object; missing
parent objects are created. Existing keys are left as they are. The parent is
the last object of that name, the one JSON keeps when a key is duplicated.
"""
import glob
import json
import os
import re
import sys

OPEN = re.compile(r'^(\s*)"((?:[^"\\]|\\.)*)": \{\s*$')
CLOSE = re.compile(r'^\s*\},?\s*$')


def object_lines(lines):
    """Map each object path (tuple) to the index of its last opening line."""
    found, stack = {(): 0}, []
    for i, line in enumerate(lines[1:], start=1):
        m = OPEN.match(line)
        if m:
            stack.append(json.loads('"%s"' % m.group(2)))
            found[tuple(stack)] = i
        elif CLOSE.match(line) and stack:
            stack.pop()
    return found


def insert(lines, path, value):
    objs = object_lines(lines)
    depth = len(path) - 1
    while tuple(path[:depth]) not in objs:
        depth -= 1
    at = objs[tuple(path[:depth])]
    indent = '  ' * (depth + 1)
    new, close = [], []
    for j, name in enumerate(path[depth:-1]):
        pad = indent + '  ' * j
        new.append('%s%s: {' % (pad, json.dumps(name, ensure_ascii=False)))
        close.insert(0, pad + '}')
    leaf_pad = indent + '  ' * (len(path) - 1 - depth)
    new.append('%s%s: %s' % (leaf_pad, json.dumps(path[-1], ensure_ascii=False),
                             json.dumps(value, ensure_ascii=False)))
    block = new + close
    # The new block is the first child: it needs a trailing comma unless the
    # parent was empty.
    nxt = lines[at + 1].strip() if at + 1 < len(lines) else '}'
    if not nxt.startswith('}'):
        block[-1] += ','
    lines[at + 1:at + 1] = block


def has(data, path):
    for k in path:
        if not isinstance(data, dict) or k not in data:
            return False
        data = data[k]
    return True


def main():
    spec = json.load(open(sys.argv[1]))
    root = os.path.join(os.path.dirname(__file__), '..', 'public', 'locales')
    for p in sorted(glob.glob(os.path.join(root, '*', 'translation.json'))):
        lang = os.path.basename(os.path.dirname(p))
        keys = dict(spec.get('*', {}))
        keys.update(spec.get(lang, {}))
        lines = open(p, encoding='utf-8').read().split('\n')
        added = 0
        for key, value in keys.items():
            path = key.split('.')
            if has(json.loads('\n'.join(lines)), path):
                continue
            insert(lines, path, value)
            added += 1
        out = '\n'.join(lines)
        data = json.loads(out)
        for key in keys:
            assert has(data, key.split('.')), (lang, key)
        open(p, 'w', encoding='utf-8').write(out)
        print(lang, added)


if __name__ == '__main__':
    main()
