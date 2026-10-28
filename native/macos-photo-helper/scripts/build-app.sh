#!/bin/zsh
set -euo pipefail

helper_root="${0:A:h:h}"
cd "$helper_root"
swift build -c release

app_dir="$helper_root/dist/Marketing Photo Helper.app"
contents_dir="$app_dir/Contents"
mkdir -p "$contents_dir/MacOS" "$contents_dir/Resources"
cp "$helper_root/.build/release/MarketingPhotoPhotoHelper" "$contents_dir/MacOS/MarketingPhotoPhotoHelper"
cp "$helper_root/Info.plist" "$contents_dir/Info.plist"
chmod +x "$contents_dir/MacOS/MarketingPhotoPhotoHelper"
echo "$app_dir"
