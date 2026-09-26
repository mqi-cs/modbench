#!/usr/bin/env bash
# TEMPORARY -- 3D layered-preview prototype. Not wired into the app.
#
# Renders the layer library: every part on its own, from the fixed camera,
# as a transparent PNG that the browser stacks (see layers.html). Skips any
# layer already rendered, so it is safe to re-run after an interruption.
#
# Prerequisites: Blender 4.5+ on PATH or in $BLENDER, and the textures
# generated first:
#
#   npx tsx scripts/3d-test/pick-dials.ts
#   npx tsx scripts/3d-test/make-textures.ts     # per dial/ring, see below
#   npx tsx scripts/3d-test/make-insert.ts       # per insert colourway
#   bash scripts/3d-test/render-batch.sh
#   npx tsx scripts/3d-test/make-manifest.ts
#
# Roughly 15s per layer on an RTX 3050 (about 5s render at 256 spp + OIDN,
# 10s scene build). Library layers already on disk were rendered at 768 spp
# with no denoise; delete them to re-render at the WS2a setting.

set -u
cd "$(dirname "$0")/../.." || exit 1
B=${BLENDER:-blender}
O=scripts/3d-test/out/layers
mkdir -p "$O"
rendered=0
skipped=0

run() {
  out=$1; view=$2; shift 2
  if [ -f "$O/$out-$view.png" ]; then skipped=$((skipped + 1)); return; fi
  env TENT=0.9 FLOOR=0.3 SAMPLES=256 DENOISE=on "$@" "$B" -b --factory-startup --python-exit-code 1 \
    --python scripts/render/render_solid.py -- D "$view" "$O/$out-$view.png" >/tmp/layer.log 2>&1
  if [ -f "$O/$out-$view.png" ]; then rendered=$((rendered + 1)); echo "ok   $out-$view"
  else echo "FAIL $out-$view"; grep -iE "error" /tmp/layer.log | head -2; fi
}

# key:shape:rgb  (empty rgb keeps the material default)
straps=(
  "jubilee:jubilee:" "oyster:oyster:" "mesh:mesh:" "nato:nato:"
  "rubber-black:rubber:0.012,0.012,0.013" "rubber-blue:rubber:0.02,0.05,0.14"
  "rubber-green:rubber:0.02,0.07,0.035"
  "leather-black:leather:0.03,0.03,0.032" "leather-brown:leather:0.20,0.095,0.045"
)
finishes=(steel pvd matte gold rose)
dials=$(node -e "require('./scripts/3d-test/out/plan-dials.json').forEach(d=>console.log(d.tag))")

echo "START $(date +%T)"
for v in hero top; do
  for f in "${finishes[@]}"; do run "case-$f" "$v" LAYER=case CASE_FINISH="$f"; done
  for h in steel gold rose black; do run "hands-$h" "$v" LAYER=hands HAND_COLOR="$h"; done
  for r in ring-white ring-gold ring-cream; do run "$r" "$v" LAYER=ring RING_TAG="$r"; done
  for i in ins-black ins-blue ins-gold ins-steel; do run "insert-$i" "$v" LAYER=insert INSERT_TAG="$i"; done
  for sp in "${straps[@]}"; do
    key=${sp%%:*}; rest=${sp#*:}; shape=${rest%%:*}; rgb=${rest#*:}
    if [ -n "$rgb" ]; then run "strap-$key" "$v" LAYER=strap STRAP="$shape" STRAP_RGB="$rgb"
    else run "strap-$key" "$v" LAYER=strap STRAP="$shape"; fi
  done
  for t in $dials; do run "dial-$t" "$v" LAYER=dial DIAL_TAG="$t"; done
done

# Case and strap in ONE layer so they light each other: the strap's shadow
# on the lugs, and each reflected in the other. Hero only -- from straight
# above the junction barely shows. Costs finishes x straps images.
for f in "${finishes[@]}"; do
  for sp in "${straps[@]}"; do
    key=${sp%%:*}; rest=${sp#*:}; shape=${rest%%:*}; rgb=${rest#*:}
    if [ -n "$rgb" ]; then run "casestrap-$f-$key" hero LAYER=casestrap CASE_FINISH="$f" STRAP="$shape" STRAP_RGB="$rgb"
    else run "casestrap-$f-$key" hero LAYER=casestrap CASE_FINISH="$f" STRAP="$shape"; fi
  done
done
echo "END $(date +%T) rendered=$rendered skipped=$skipped"
