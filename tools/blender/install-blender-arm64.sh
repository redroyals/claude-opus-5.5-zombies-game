#!/bin/sh
# User-local Blender 4.0.2 on linux-arm64 (no sudo): Ubuntu noble .debs extracted into ~/opt/blender-deb/root.
set -e
mkdir -p ~/opt/blender-deb ~/opt/blender && cd ~/opt/blender-deb
apt-get download blender blender-data
need=""; for p in $(apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks --no-replaces --no-enhances blender | grep '^\w' | sort -u); do dpkg -s "$p" >/dev/null 2>&1 || need="$need $p"; done
apt-get download $need || true
# ESM-pinned candidates 401 without a subscription: fetch the plain archive versions explicitly
for p in libopenimageio2.4t64 libopenexr-3-1-30 liburiparser1 libdcmtk17t64; do v=$(apt-cache madison $p | grep -v esm | head -1 | awk -F'|' '{gsub(/ /,"",$2);print $2}'); apt-get download "$p=$v" || true; done
for f in *.deb; do dpkg -x "$f" root; done
pip install -q --target ~/opt/blender/py "numpy<2"
R=$HOME/opt/blender-deb/root
cat > ~/opt/blender/blender <<EOW
#!/bin/sh
R=$R
export LD_LIBRARY_PATH=\$R/usr/lib/aarch64-linux-gnu:\$R/usr/lib:\$R/usr/lib/aarch64-linux-gnu/blas:\$R/usr/lib/aarch64-linux-gnu/lapack
export BLENDER_SYSTEM_SCRIPTS=\$R/usr/share/blender/scripts
export BLENDER_SYSTEM_DATAFILES=\$R/usr/share/blender/datafiles
export PYTHONPATH=\$HOME/opt/blender/py
exec \$R/usr/bin/blender "\$@"
EOW
chmod +x ~/opt/blender/blender && ~/opt/blender/blender --version | head -1
