{ pkgs, ... }: {
  nativeBuildInputs = [
    pkgs.nodejs
    pkgs.libvips
    pkgs.glib
    pkgs.pango
    pkgs.cairo
    pkgs.gdk_pixbuf
    pkgs.libX11
    pkgs.libXext
    pkgs.libXrender
    pkgs.libXfixes
    pkgs.libXi
    pkgs.libXrandr
    pkgs.libXcursor
    pkgs.libXdamage
    pkgs.libXcomposite
    pkgs.libXtst
    pkgs.libXss
    pkgs.libXrandr
    pkgs.atk
    pkgs.atkmm
    pkgs.nss
    pkgs.cups
    pkgs.dbus
    pkgs.libgcrypt
    pkgs.libsecret
    pkgs.fontconfig
    pkgs.freetype
    pkgs.gtk3
    pkgs.xorg.libxkbcommon
    pkgs.xorg.libxkbfile
    pkgs.alsa
    pkgs.ffmpeg
    pkgs.openssl
    pkgs.zlib
    pkgs.libgbm
    pkgs.libdrm
    pkgs.libxshmfence
    pkgs.libnotify
    pkgs.libXcomposite
  ];

  env = {
    # Replit provides DATABASE_URL automatically when a Postgres database is added.
    # These must be set as Replit Secrets in the UI:
    #   OPENROUTER_API_KEY, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY,
    #   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
  };
}
