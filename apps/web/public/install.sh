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
  *) fail "Unsupported platform: $(uname -s). Trunk supports macOS and Linux. On Windows, install inside WSL." ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required but not on PATH. Install it and re-run (apt install curl, brew install curl, etc.)."
fi
if ! command -v git >/dev/null 2>&1; then
  fail "git is required but not on PATH. Install it and re-run (apt install git, brew install git, etc.)."
fi

if ! mkdir -p "$(dirname "${INSTALL_DIR}")" 2>/dev/null; then
  fail "Cannot create ${INSTALL_DIR}. Check that you have write permission to that path or set TRUNK_INSTALL_DIR."
fi

if ! command -v bun >/dev/null 2>&1; then
  say "Installing Bun..."
  if ! curl -fsSL https://bun.sh/install | sh; then
    fail "Bun installation failed. Check your network and try again, or install Bun manually from https://bun.sh."
  fi
  if [ -f "${HOME}/.bun/bin/bun" ]; then
    export PATH="${HOME}/.bun/bin:${PATH}"
  fi
  if ! command -v bun >/dev/null 2>&1; then
    fail "Bun installed but isn't on PATH. Open a new shell (or run 'source ~/.bashrc' / 'source ~/.zshrc') and re-run this installer."
  fi
fi

if [ -d "${INSTALL_DIR}/.git" ]; then
  say "Updating ${INSTALL_DIR}..."
  git -C "${INSTALL_DIR}" pull --ff-only \
    || fail "git pull failed in ${INSTALL_DIR}. Resolve local changes (or remove the directory) and re-run."
else
  say "Cloning ${REPO_URL} into ${INSTALL_DIR}..."
  git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}" \
    || fail "git clone failed. Check your network and that the repo URL is reachable."
fi

say "Installing dependencies..."
( cd "${INSTALL_DIR}" && bun install --frozen-lockfile ) \
  || fail "bun install failed. Re-run the installer; if it persists open an issue with the output above."

if ! mkdir -p "${BIN_DIR}" 2>/dev/null; then
  fail "Cannot create ${BIN_DIR}. Set TRUNK_BIN_DIR to a writable directory and re-run."
fi
SHIM="${BIN_DIR}/trunk"
cat > "${SHIM}" <<EOF || fail "Cannot write ${SHIM}. Check permissions on ${BIN_DIR}."
#!/usr/bin/env sh
exec bun run "${INSTALL_DIR}/apps/server/src/bin.ts" "\$@"
EOF
chmod +x "${SHIM}" || fail "Cannot mark ${SHIM} executable. Check filesystem permissions."

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
