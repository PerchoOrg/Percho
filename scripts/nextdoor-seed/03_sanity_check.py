#!/usr/bin/env python3
"""Render 12 random polygons on leaflet HTML for human sanity check."""
import json, pathlib, random, sys
import os
HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(os.environ.get('SEED_OUT_DIR', str(HERE / '_out')))
files = list((OUT / 'neighborhood_pages').glob('*.json'))
random.seed(42)
sample = random.sample(files, 12)
features = []
for p in sample:
    d = json.loads(p.read_text())
    features.append({
        "type": "Feature",
        "properties": {
            "name": d["name"],
            "slug": d["slug"],
            "residents": d.get("residents_count"),
            "income": d.get("avg_income"),
        },
        "geometry": d["geometry"],
    })
fc = {"type": "FeatureCollection", "features": features}
html = """<!DOCTYPE html><html><head>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body,html,#map{margin:0;height:100vh;}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map').setView([33.75,-84.39], 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
const data = %s;
L.geoJSON(data, {
  style: () => ({color:'#e63946', weight:2, fillOpacity:0.25}),
  onEachFeature: (f, l) => l.bindPopup(`<b>${f.properties.name}</b><br>${f.properties.slug}<br>Residents: ${f.properties.residents}<br>Income: ${f.properties.income}`)
}).addTo(map);
</script></body></html>""" % json.dumps(fc)
out = OUT / 'sanity_check.html'
out.write_text(html)
print(f'wrote {out} ({len(html)} bytes, {len(features)} polygons)')
for f in features:
    p = f['properties']
    print(f"  {p['name']:30} {p['slug']}")
