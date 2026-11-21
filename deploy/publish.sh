#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test -f "$repo/dist/index.html"
install -d -m 755 /var/www
stage=$(mktemp -d /var/www/personal-pages-stage.XXXXXXXX)
trap 'test -z "${stage:-}" || rm -rf -- "$stage"' EXIT
cp -a "$repo/dist/." "$stage/"
chown -R root:root "$stage"
chmod -R a+rX "$stage"
chmod 755 "$stage"
# Keep old hashed assets so already-open pages can finish loading after deploy.
if test -d /var/www/personal-pages/assets; then
  mkdir -p "$stage/assets"
  cp -an /var/www/personal-pages/assets/. "$stage/assets/"
fi
if test -e /var/www/personal-pages-previous; then
  test "$(realpath /var/www/personal-pages-previous)" = /var/www/personal-pages-previous
  rm -rf -- /var/www/personal-pages-previous
fi
if test -e /var/www/personal-pages; then
  test "$(realpath /var/www/personal-pages)" = /var/www/personal-pages
  mv /var/www/personal-pages /var/www/personal-pages-previous
fi
mv "$stage" /var/www/personal-pages
stage=''
echo 'Frontend published to /var/www/personal-pages'
