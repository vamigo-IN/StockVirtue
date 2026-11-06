"""Trim a variable font's axes and subset it to the public site's character set.

usage: python -I make_font.py <src.ttf> <out.woff2> "wght=400:800,wdth=82:120" [--family "SV Serif"]
       (an axis given a single value, e.g. "opsz=20", is pinned and removed)

The committed files in src/fonts were built from the upstream variable TTFs in
github.com/google/fonts (ofl/archivo/Archivo[wdth,wght].ttf and
ofl/sourceserif4/SourceSerif4[opsz,wght].ttf, plus the Italic), from web/:

  python -I scripts/fonts/make_font.py Archivo[wdth,wght].ttf src/fonts/archivo-sv.woff2 "wght=400:800,wdth=82:120"
  python -I scripts/fonts/make_font.py SourceSerif4[opsz,wght].ttf src/fonts/source-serif-sv.woff2 "wght=400:700,opsz=20" --family "SV Serif"
  python -I scripts/fonts/make_font.py SourceSerif4-Italic[opsz,wght].ttf src/fonts/source-serif-sv-italic.woff2 "wght=400:700,opsz=20" --family "SV Serif"

--family renames the output. Source Serif 4 is licensed under the SIL Open Font
License 1.1 "with Reserved Font Name 'Source'", and a subset with an axis pinned
is a Modified Version, which may not use that name. The option rewrites the
names a font presents (name IDs 1, 3, 4, 6, 16 and 17, plus the PostScript
names of the variations prefix (ID 25) and of the named instances) and keeps
the copyright (0), the licence (13) and its URL (14), and every other record,
unchanged. Nothing visible changes: CSS reaches the face through next/font's
generated family name, never the internal one. Archivo reserves no name.

Needs fontTools >= 4.61 and brotli. It subsets first, then instances, then
prints the size and checks the glyphs the site relies on (the rupee sign and
the true minus must both say "yes").
"""
import sys, os, site
sys.path.append(site.getusersitepackages())
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

args = sys.argv[1:]
family = None
if '--family' in args:
    i = args.index('--family')
    if i + 1 >= len(args) or not args[i + 1].strip():
        sys.exit('--family needs a name, e.g. --family "SV Serif"')
    family = args[i + 1].strip()
    del args[i:i + 2]
if len(args) != 3:
    sys.exit(__doc__)
src, out, axes_spec = args

f = TTFont(src, lazy=False)
limits = {}
for part in axes_spec.split(','):
    tag, rng = part.split('=')
    if ':' in rng:
        lo, hi = rng.split(':')
        limits[tag] = (float(lo), float(hi))
    else:
        limits[tag] = float(rng)
U = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100))
     + [0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC]
     + list(range(0x2000, 0x2070))
     + [0x20B9, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215,
        0x25B2, 0x25BC, 0x25CF, 0x25D0, 0x25A0, 0x00D7, 0xFEFF, 0xFFFD])
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.name_languages = ['*']
opts.notdef_outline = True
opts.drop_tables += ['DSIG']
opts.hinting = False
s = subset.Subsetter(opts)
s.populate(unicodes=U)
s.subset(f)
f = instancer.instantiateVariableFont(f, limits)


def rename(font, new_family):
    """Rewrite the presented names (see the module docstring); keep 0, 13, 14."""
    name = font['name']
    old_family = name.getDebugName(16) or name.getDebugName(1)
    subfamily = name.getDebugName(17) or name.getDebugName(2) or 'Regular'
    old_ps = (name.getDebugName(6) or '').split('-')[0]
    new_ps_family = ''.join(ch for ch in new_family if ch.isalnum())
    style_ps = ''.join(ch for ch in subfamily if ch.isalnum()) or 'Regular'
    ps_name = f'{new_ps_family}-{style_ps}'
    version = (name.getDebugName(3) or name.getDebugName(5) or '1.0').split(';')[0].strip()
    version = version.replace('Version ', '') or '1.0'
    # The PostScript names of the variations prefix and the named instances.
    ps_ids = {25}
    if 'fvar' in font:
        ps_ids |= {i.postscriptNameID for i in font['fvar'].instances
                   if i.postscriptNameID not in (None, 0xFFFF)}
    for rec in list(name.names):
        nid = rec.nameID
        if nid in (0, 13, 14):
            continue
        if nid == 1:
            value = new_family
        elif nid == 3:
            value = f'{version};SV;{ps_name}'
        elif nid == 4:
            value = f'{new_family} {subfamily}'
        elif nid == 6:
            value = ps_name
        elif nid == 16:
            value = new_family
        elif nid == 17:
            value = subfamily
        elif nid in ps_ids and old_ps:
            # e.g. "SourceSerif4Roman-Bold" -> "SVSerifRoman-Bold"
            stem = old_ps.split('Roman')[0].split('Italic')[0] or old_ps
            value = rec.toUnicode().replace(stem, new_ps_family)
        else:
            continue
        rec.string = value
    return old_family


old = rename(f, family) if family else None
f.flavor = 'woff2'
f.save(out)
g = TTFont(out)
cmap = g.getBestCmap()
axes = [(a.axisTag, a.minValue, a.maxValue) for a in g['fvar'].axes] if 'fvar' in g else []
feats = set()
if 'GSUB' in g and g['GSUB'].table.FeatureList:
    feats |= {r.FeatureTag for r in g['GSUB'].table.FeatureList.FeatureRecord}
check = {'rupee U+20B9': 0x20B9, 'minus U+2212': 0x2212, 'up-tri U+25B2': 0x25B2, 'down-tri U+25BC': 0x25BC,
         'bullet U+25CF': 0x25CF, 'arrow U+2192': 0x2192, 'times U+00D7': 0xD7, 'middot U+00B7': 0xB7, 'ndash U+2013': 0x2013}
print(os.path.basename(out), f'{os.path.getsize(out)/1024:.1f} KB', 'axes', axes)
print('   ', ', '.join(f'{k}: {"yes" if v in cmap else "NO"}' for k, v in check.items()))
print('    tnum' , 'tnum' in feats, '| lnum', 'lnum' in feats, '| frac', 'frac' in feats, '| case', 'case' in feats)
if family:
    n = g['name']
    print(f'    renamed {old!r} -> {n.getDebugName(1)!r}: full {n.getDebugName(4)!r}, PostScript {n.getDebugName(6)!r}')
