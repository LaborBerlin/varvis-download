#!/bin/bash
# Create a release: Create a tag based on the current version and push that version.
#
# Used by `make release`.

set -Eeuo pipefail

CUR_VERS=$(node -p "require('./package.json').version")
echo "Current version is: $CUR_VERS"

CUR_BRANCH=$(git branch --show-current)

if [[ "$CUR_BRANCH" != "main" ]] && [[ ! "$CUR_VERS" =~ -dev\.[0-9]+$ ]]; then
  echo "Releasing a production version is only allowed on the main branch. You should rebase or merge this branch with main first."
  echo "Do you want to continue anyway? [Y/n]"
  read -r answ
  if [ "$answ" != "Y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

if [[ "$CUR_VERS" != *"dev"* ]]; then
  ENV_NOTE="FOR PRODUCTION"
else
  ENV_NOTE="for development"
fi

echo "Create version tag, push and release this version? [Y/n]"
read -r answ

if [ "$answ" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

git tag -a "v$CUR_VERS" -m "release $CUR_VERS"
git push origin "v$CUR_VERS"


## Section is temporary until a github action is created
echo "Create a release and including source code archives (Make sure gh cli has sufficient permission)? [Y/n]"
read -r answ

if [ "$answ" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

command -v gh >/dev/null || {
  echo "GitHub CLI (gh) not available" >&2
  exit 1
}
gh auth status

dest="dist"
release_tag="v$CUR_VERS"
mkdir -p "$dest"

# Changelog-section of new version
changelog_section=$(
  git show "$release_tag:CHANGELOG.md" |
    awk -v heading="## [$CUR_VERS] " '
      index($0, heading) == 1 { found = 1; next }
      found && /^## / { exit }
      found { print }
    '
)

if [[ -z "${changelog_section//[[:space:]]/}" ]]; then
  echo "No changelog-entry found for $CUR_VERS"
  exit 1
fi

assets=()
for format in zip tar.gz; do
  archive_file="$dest/Source code.$format"
  git archive \
    --format="$format" \
    --prefix="varvis-download-$release_tag/" \
    --output="$archive_file" \
    "$release_tag"
  assets+=("$archive_file")
done

printf '%s\n' "$changelog_section" |
  gh release create "$release_tag" \
    --verify-tag \
    --title "$release_tag" \
    --notes-file - \
    "${assets[@]}"
