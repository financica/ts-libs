#!/usr/bin/env bash
# Validate a rendered return against the official taxonomy with Arelle,
# formula assertions included. This is the closest local stand-in for what
# Biztax runs on upload (UBMatrix XPE).
#
#   scripts/arelle-check.sh <taxonomy-dir> <instance.xbrl> [--offline]
#
# <taxonomy-dir> is the unpacked release, as for generate-taxonomy.ts. Needs
# `uvx` and, on the first run, network access to www.xbrl.org for the XBRL
# specification schemas (Arelle caches them under ~/.config/arelle/cache).
# Pass --offline once they are cached: Arelle otherwise revalidates each one
# over the network, which hangs where www.xbrl.org is slow or unreachable.
#
# The release is copied and patched before use, for two defects of its own:
#   - pfs-dt imports xbrl-instance-2003-12-31.xsd by a relative name that the
#     release does not ship; it is pointed at xbrl.org instead.
#   - be-tax-f-idtc-5368 and -5369 (investment deduction) hold XPath that
#     Arelle cannot parse, and one parse error stops every assertion from
#     running; they are left out.
# The rules that read a tuple (f-1021, f-1027 to f-1032) raise XPTY0004 inside
# Arelle whatever the instance holds. Those lines are noise, not findings.
set -euo pipefail

taxonomy=${1:?usage: arelle-check.sh <taxonomy-dir> <instance.xbrl>}
instance=${2:?usage: arelle-check.sh <taxonomy-dir> <instance.xbrl>}
connectivity=online
[ "${3:-}" = "--offline" ] && connectivity=offline

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

release=$(basename "$(ls "$taxonomy"/be-tax-inc-rcorp-*.xsd)" .xsd)
release=${release#be-tax-inc-rcorp-}
dts="$work/be-tax-$release/DTS"
mkdir -p "$(dirname "$dts")"
cp -r "$taxonomy" "$dts"
sed -i 's#schemaLocation="xbrl-instance-2003-12-31.xsd"#schemaLocation="http://www.xbrl.org/2003/xbrl-instance-2003-12-31.xsd"#' "$dts"/*.xsd
sed -i '/be-tax-f-idtc-536[89]-/d' "$dts"/*.xsd
cp "$instance" "$work/instance.xbrl"

uvx --from arelle-release arelleCmdLine --internetConnectivity="$connectivity" \
	--file "$work/instance.xbrl" --validate --formula=run \
	--logFile "$work/arelle.log" >/dev/null 2>&1 || true

# What is left after the noise is what Biztax would say.
grep -v '^\[info\|^\[\]\|missingRoleRefForResourceRole\|^ - instance.xbrl' "$work/arelle.log" |
	awk '/^\[err:XPTY0004\]/ { skip = 2 } skip > 0 { skip--; next } { print }' |
	sed "s#$work/##g"
