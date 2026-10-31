"""Regenerate frontend/constants/entityIcons.ts from the Android icon registry.

Usage: python3 scripts/gen-entity-icons.py <svg-dir>

<svg-dir> holds one Material Symbols Outlined SVG per glyph named below, e.g.
https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/home/materialsymbolsoutlined/home_24px.svg
saved as <svg-dir>/home.svg. Run prettier on the output afterwards.
"""
import re, json, sys, os
kt = open('android/app/src/main/java/ch/nicolab/cadence/ui/icon/HabitIconRegistry.kt', encoding='utf-8').read()
svgdir = sys.argv[1]
glyph = {
 'fitness':'fitness_center','run':'directions_run','walk':'directions_walk','bike':'directions_bike','water':'water_drop','food':'restaurant','bed':'bedtime','meditation':'self_improvement','pill':'medication','heart':'favorite','swim':'pool','spa':'spa','weight':'monitor_weight','drink':'local_drink','coffee':'coffee','smoke-free':'smoke_free','hike':'hiking','stretch':'accessibility_new','abs':'sports_gymnastics','toothpaste':'clean_hands','tooth':'dentistry','cream':'soap',
 'book':'menu_book','study':'school','code':'code','work':'work','money':'savings','timer':'timer','check':'check_circle','star':'star','calendar':'calendar_today','target':'track_changes','notes':'edit_note','email':'mail','language':'language','calculate':'calculate','idea':'lightbulb',
 'music':'music_note','brush':'brush','camera':'photo_camera','nature':'park','sun':'wb_sunny','phone':'phonelink_off','pet':'pets','movie':'movie','games':'sports_esports','piano':'piano','palette':'palette','travel':'travel_explore','flight':'flight',
 'clean':'cleaning_services','home':'home','shopping':'shopping_cart','smile':'sentiment_satisfied','laundry':'local_laundry_service','garden':'yard','tidy':'delete_sweep','car':'directions_car','cook':'kitchen','family':'child_care',
}
rows = re.findall(r'HabitIcon\("([^"]+)",\s*[^,]+,\s*"([^"]*)",\s*"([^"]*)",\s*IconCategory\.(\w+),\s*listOf\(([^)]*)\)\)', kt)
assert len(rows) == len(glyph), (len(rows), len(glyph))
out = []
for id_, fr, en, cat, terms in rows:
    svg = open(os.path.join(svgdir, glyph[id_] + '.svg'), encoding='utf-8').read()
    paths = re.findall(r'<path d="([^"]+)"', svg)
    assert len(paths) == 1, id_
    out.append({'id': id_, 'labelFr': fr, 'labelEn': en, 'category': cat.lower(),
                'terms': re.findall(r'"([^"]*)"', terms), 'path': paths[0]})
lines = ["// Generated from android/app/src/main/java/ch/nicolab/cadence/ui/icon/",
 "// HabitIconRegistry.kt: same ids, labels and search terms, so an icon picked",
 "// on the web shows the same glyph on Android. Glyphs: Material Symbols",
 "// Outlined (Google, Apache License 2.0), viewBox 0 -960 960 960.",
 "// Regenerate with scripts/gen-entity-icons.py after changing the registry.",
 "",
 "export type EntityIconCategory = 'health' | 'productivity' | 'leisure' | 'home';",
 "",
 "export interface EntityIconDef {",
 "    id: string;",
 "    labelFr: string;",
 "    labelEn: string;",
 "    category: EntityIconCategory;",
 "    terms: string[];",
 "    path: string;",
 "}",
 "",
 "export const ENTITY_ICONS: EntityIconDef[] = ["]
for o in out:
    lines.append("    {")
    for k in ('id','labelFr','labelEn','category'):
        lines.append(f"        {k}: {json.dumps(o[k], ensure_ascii=False)},")
    lines.append(f"        terms: {json.dumps(o['terms'], ensure_ascii=False)},")
    lines.append(f"        path: {json.dumps(o['path'])},")
    lines.append("    },")
lines.append("];")
lines.append("")
open('frontend/constants/entityIcons.ts','w',encoding='utf-8').write('\n'.join(lines))
print(len(out))
