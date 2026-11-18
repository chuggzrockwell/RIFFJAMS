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

## Stems in single song mode

In the Song Map's Single Song view, a mixer sits next to the player: **Stems** on plays the song from
your own stem files instead of YouTube, with a volume, mute (M) and solo (S, shift-click to add) per
part (vocals, drums, bass, other, guitar) and tuning in 1 Hz steps (A = 440 ± n; click the value to
reset). Songs without a stem file, or Stems off, play YouTube as before. Code: `rj-stems.js`.

The files are one 10-channel WAV per song (`Loop Prototype\looper\songs\<slug>.wav` + `index.json`),
made from the Demucs stems by `Loop Prototype\build\make_song_files.py`. They're read from the Loop
Station chip folder you already chose (same browser), so they never go in this repo.
`?stems=<url>` loads the songs folder from a server instead.

## Guns N' Roses

The home screen's band switch (or `?band=gnr`) opens the Guns N' Roses section: same Song Map
(Riff / Solo / Arrangement / Single Song, Edit, Playboard), Lick Library and Loop Station, with its
own saved data (`gnr-data.json`, tabs in `user-tabs/gnr/`). Band setup lives in `rj-band.js`.

Songs play from your own files: the first time you press play, choose the `Guns N' Roses` music
folder (Desktop). Chrome / Edge remember it. The Loop Station uses its own chip folder,
`Loop Prototype\looper-gnr`. Covers in `covers/gnr/` come from the Cover Art Archive (MusicBrainz).

## Led Zeppelin

`?band=zeppelin` (or the Led Zeppelin card on the home page) opens the Led Zeppelin section, built the same way
as Guns N' Roses: its own saved data (`zeppelin-data.json`, tabs in `user-tabs/zeppelin/`), songs
played from your own files (choose the `Led Zeppelin` folder on the Desktop the first time you press
play), and the Loop Station chip folder `Loop Prototype\looper-zeppelin`. Songs use the remastered
files wherever the folder has them (`Led Zeppelin Remasters` discs, `The Complete Led Zeppelin
(Remastered)`). Covers in `covers/zeppelin/` are placeholders.
