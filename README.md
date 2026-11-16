# RIFFJAMS

Black Sabbath practice / Song Map / Lick Libraries browser.

Open [index.html](index.html) or use GitHub Pages.

## In-site tab attachments

In Song Map Edit mode, open a chip and paste, drop, or choose a tab screenshot in
the chip editor. `Attach & Save` writes the PNG and the shared map data to GitHub
in one commit, so Peek, Library, and Playboard all receive the same attachment.
Each chip holds one tab. Attaching again replaces that chip's previous tab; an
old uploaded image is removed when no other chip still uses it.

The first attachment on a browser requires a fine-grained GitHub token restricted
to this repository with **Contents: Read and write** permission. The token is kept
in that browser only and can be disconnected from the chip editor.

## Guns N' Roses

The home screen's band switch (or `?band=gnr`) opens the Guns N' Roses section: same Song Map
(Riff / Solo / Arrangement / Single Song, Edit, Playboard), Lick Library and Loop Station, with its
own saved data (`gnr-data.json`, tabs in `user-tabs/gnr/`). Band setup lives in `rj-band.js`.

Songs play from your own files: the first time you press play, choose the `Guns N' Roses` music
folder (Desktop). Chrome / Edge remember it. The Loop Station uses its own chip folder,
`Loop Prototype\looper-gnr`. Covers in `covers/gnr/` are placeholders; replace them with real
art under the same names.
