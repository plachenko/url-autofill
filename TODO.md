# TODO

## Replay completed renders after reconnect

The Blender add-on currently sends the latest `render_progress` status to a new WebSocket client but does not resend the rendered file. A reloaded browser can therefore show a complete render bar with no clip if it was disconnected during the file transfer or connected only after the render finished. The page can restore a file it previously verified and saved in that browser, but it cannot recover bytes it never received.

- Locate the Render to WebSocket add-on source and add a bounded cache of the latest completed output file in server mode.
- On a new client connection, send the cached file using the existing `file_start`, `file_chunk`, and `file_end` protocol after the latest render status. Give each replay a fresh transfer ID and retain the original filename and MIME type.
- Keep the cache until a newer completed output replaces it or the add-on stops. Limit its size so a large render cannot exhaust memory; report clearly when replay is unavailable.
- Test reconnects before, during, and after file transfer, including failed checksums and a second render replacing the first.
