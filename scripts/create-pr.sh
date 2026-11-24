#!/bin/bash
# prepare a release or conventional draft PR and open it in a browser
# release PRs also prepare the version, changelog, and release branch
# used by `make pr`

set -Eeuo pipefail

getPackageVersion() {
    echo $(node -p "require('./package.json').version")
}

# read the current package version
CUR_VERS=$(getPackageVersion)
echo "Preparing a PR"
# confirm the local PR checklist
cat <<EOF
Checklist before creating a PR:

- run all tests locally and via CI
- update the documentation if necessary
- make a local code review

EOF
read -rp "All done? (y/N): " a
if ! [[ "$a" =~ ^[yY]$ ]]; then
  echo "Aborting."
  exit
fi

# prepare the release version, changelog, and branch when requested
echo "You can either create a release PR, which will bump the current version and update the changelog, or a conventional PR, that will keep the current version and changelog."
read -rp "Create a release PR? (y/N): " a
if [[ "$a" =~ ^[yY]$ ]]; then
  RELEASE_PR=1
  echo "Current version is: $CUR_VERS"
  echo "Please enter new version (without \"v\" at the start!), a bump command like \"major\", \"minor\", \"patch\", etc. or leave empty to keep the current version:"

  read -r NEW_VERS
  if [ -n "$NEW_VERS" ]; then
    if [[ "$NEW_VERS" =~ ^[0-9] ]]; then
      # a fixed version like 0.1.2
      npm version --no-git-tag-version "$NEW_VERS"
    else
      # not a version, but probably a bump command like "major", "minor", "patch", etc.
      npm version --no-git-tag-version --bump "$NEW_VERS"
      NEW_VERS=$(getPackageVersion)
    fi
    git add package.json package-lock.json
    CUR_VERS="$NEW_VERS"
  fi

  echo "Will generate and display the latest changelog section ..."
  make changelog
  CHANGELOG_SECTION=$(awk '/^## / { if (found) exit; found = 1 } found' CHANGELOG.md)
  echo "$CHANGELOG_SECTION" | less

  git add CHANGELOG.md
  git_args=()
  read -rp "Amend previous commit? (y/N): " a
  if [[ "$a" =~ ^[Yy]$ ]]; then
    git_args+=(--amend --no-edit)
  else
    git_args+=(-m "chore: version bump to v$CUR_VERS")
  fi

  BRANCH="release/v$CUR_VERS"
  git checkout -b "$BRANCH"

  git commit "${git_args[@]}"
else
  RELEASE_PR=0
  BRANCH=$(git branch --show-current)
fi

# push the prepared branch
echo "Will push to branch $BRANCH"
git push origin "$BRANCH"

# collect the PR title and body
if [[ $RELEASE_PR -eq 1 ]]; then
  PR_TITLE="Release v$CUR_VERS"
  echo "Which text do you want to submit for the PR body? Enter a number:"
  cat <<EOF
1: Changelog text
2: Enter custom text
3: None
all other: Abort
EOF
  read -r a

  if [[ "$a" = "1" ]]; then
    PR_BODY="$CHANGELOG_SECTION"
  elif [[ "$a" = "2" ]]; then
    echo "Enter the PR body; press Ctrl+D on an empty line to finish:"
    PR_BODY=$(cat)
  elif [[ "$a" = "3" ]]; then
    PR_BODY=""
  else
    echo "Aborting."
    exit
  fi
else
  read -rp "Enter the PR title: " PR_TITLE
  echo "Enter the PR body; press Ctrl+D on an empty line to finish:"
  PR_BODY=$(cat)
fi

# submit the draft PR and open its URL
echo "Will create a PR draft"
PR_URL=$(gh pr create \
  --title "$PR_TITLE" \
  --assignee "@me" \
  --body "$PR_BODY" \
  --draft)

echo "Will open the draft in the browser at $PR_URL"
xdg-open "$PR_URL"
