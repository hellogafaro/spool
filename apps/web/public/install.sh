#!/usr/bin/env sh
# Trunk installer.
#
#   curl -fsSL https://app.trunk.codes/install.sh | sh
#
# Clones the trunk repo, installs Bun if missing, installs deps,
# drops a `trunk` shim into ~/.local/bin, and runs `trunk pair`.

set -eu

REPO_URL="${TRUNK_REPO_URL:-https://github.com/hellogafaro/trunk.git}"
INSTALL_DIR="${TRUNK_INSTALL_DIR:-${HOME}/.trunk/source}"
BIN_DIR="${TRUNK_BIN_DIR:-${HOME}/.local/bin}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
say()  { printf '%s\n' "$1"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

bold "Trunk installer"

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) fail "Unsupported platform: $(uname -s). Trunk supports macOS and Linux." ;;
esac

command -v git >/dev/null 2>&1 || fail "git is required. Install it and re-run."

if ! command -v bun >/dev/null 2>&1; then
  say "Installing Bun..."
  curl -fsSL https://bun.sh/install | sh
  if [ -f "${HOME}/.bun/bin/bun" ]; then
    export PATH="${HOME}/.bun/bin:${PATH}"
  fi
  command -v bun >/dev/null 2>&1 || fail "Bun installation didn't expose bun on PATH. Open a new shell and re-run."
fi

if [ -d "${INSTALL_DIR}/.git" ]; then
  say "Updating ${INSTALL_DIR}..."
  git -C "${INSTALL_DIR}" pull --ff-only
else
  say "Cloning ${REPO_URL} into ${INSTALL_DIR}..."
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
fi

say "Installing dependencies..."
( cd "${INSTALL_DIR}" && bun install --frozen-lockfile )

mkdir -p "${BIN_DIR}"
SHIM="${BIN_DIR}/trunk"
cat > "${SHIM}" <<EOF
#!/usr/bin/env sh
exec bun run "${INSTALL_DIR}/apps/server/src/bin.ts" "\$@"
EOF
chmod +x "${SHIM}"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) bold "Add ${BIN_DIR} to your PATH:"
     say "  echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ~/.profile" ;;
esac

say ""
bold "Done. Next:"
say "  trunk pair      # claims this machine against your Trunk account"
say "  trunk start     # serves the environment to app.trunk.codes"
say ""
