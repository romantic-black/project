#!/usr/bin/env bash
set -euo pipefail

PACKAGE="ros-noetic-rosbridge-server"
TARGET_VERSION="0.11.17-1focal.20250520.012730"
APT_SOURCE="/etc/apt/sources.list.d/ros-latest.list"
KEYRING="/usr/share/keyrings/ros-archive-keyring.gpg"
ARCH_EXPECTED="arm64"

log() { printf '[rosbridge-check] %s\n' "$*"; }

arch=$(dpkg --print-architecture)
if [ "$arch" != "$ARCH_EXPECTED" ]; then
  log "warning: detected architecture '$arch' (expected '$ARCH_EXPECTED')."
fi

declare -a pkgs_to_install=()
for pkg in curl gnupg2; do
  if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
    pkgs_to_install+=("$pkg")
  fi
done

if [ "${#pkgs_to_install[@]}" -gt 0 ]; then
  log "installing prerequisites: ${pkgs_to_install[*]}"
  sudo apt-get update
  sudo apt-get install -y "${pkgs_to_install[@]}"
fi

if [ ! -f "$KEYRING" ]; then
  log "installing ROS archive keyring..."
  sudo mkdir -p "$(dirname "$KEYRING")"
  tmp_key=$(mktemp)
  trap 'rm -f "$tmp_key" "${tmp_key}.gpg"' EXIT
  curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o "$tmp_key"
  sudo gpg --dearmor "$tmp_key"
  sudo mv "${tmp_key}.gpg" "$KEYRING"
  sudo chmod 644 "$KEYRING"
  rm -f "$tmp_key"
  trap - EXIT
fi

if [ ! -f "$APT_SOURCE" ] || ! grep -q "packages.ros.org" "$APT_SOURCE"; then
  log "configuring ROS apt repository..."
  echo "deb [arch=${arch} signed-by=${KEYRING}] http://packages.ros.org/ros/ubuntu focal main" | sudo tee "$APT_SOURCE" > /dev/null
fi

log "updating package index..."
sudo apt-get update

installed_info=$(dpkg-query -W -f='${Status} ${Version}\n' "$PACKAGE" 2>/dev/null || true)
if printf '%s' "$installed_info" | grep -q "install ok installed"; then
  current_version=$(printf '%s' "$installed_info" | awk '{print $4}')
  if [ "$current_version" = "$TARGET_VERSION" ]; then
    log "package ${PACKAGE} already at desired version ${current_version}."
    exit 0
  else
    log "package ${PACKAGE} present at ${current_version}, upgrading to ${TARGET_VERSION}..."
  fi
else
  log "package ${PACKAGE} not installed, installing ${TARGET_VERSION}..."
fi

sudo apt-get install -y "${PACKAGE}=${TARGET_VERSION}"

log "verifying installation..."
final_version=$(dpkg-query -W -f='${Version}' "$PACKAGE")
if [ "$final_version" != "$TARGET_VERSION" ]; then
  log "error: expected version ${TARGET_VERSION}, but found ${final_version}."
  exit 1
fi

log "rosbridge_server ready at version ${TARGET_VERSION}."