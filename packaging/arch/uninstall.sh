#!/usr/bin/env bash
# Remove the installed Kenku FM package. Settings in ~/.config/Kenku FM are kept.
set -euo pipefail

if pacman -Q kenku-fm-fluxer &>/dev/null; then
  sudo pacman -R kenku-fm-fluxer
  echo "Uninstalled kenku-fm-fluxer. Your settings in ~/.config/Kenku FM were kept."
else
  echo "kenku-fm-fluxer is not installed."
fi
