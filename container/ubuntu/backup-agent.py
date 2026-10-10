#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# deskl.ink — loopback backup/restore agent
# -----------------------------------------------------------------------------
# A tiny stdlib HTTP service the deskl.ink Durable Object uses to snapshot and
# restore the user's /home to/from R2. It shells out to `tar` and STREAMS, so a
# multi-GiB home never buffers in RAM.
#
#   GET  /backup   → streams `tar -C /home -czf - .`   (Content-Type gzip)
#   POST /restore  → pipes the request body into `tar -C /home -xzf -`
#   GET  /health   → 200 {"ok":true}
#
# SECURITY: binds 0.0.0.0, with NO authentication — the SAME trust model and
# network posture as ttyd/websockify in this image (see start.sh § SECURITY).
# The bind MUST be 0.0.0.0: the deskl.ink Durable Object reaches :7070 via the
# Cloudflare Container runtime's `getTcpPort(7070)`/containerFetch, which connects
# from OUTSIDE the container's network namespace — a 127.0.0.1 bind is simply
# UNREACHABLE from there (proven by ttyd/websockify, which bind 0.0.0.0 for the
# exact same reason). This is safe HERE because the port is deliberately NOT in
# the Dockerfile EXPOSE and is reachable ONLY by the DO through the container
# runtime's private port access — never published, never on the public internet.
# The ONLY public entrypoint is the deskl.ink Worker (signed ticket + wss), and
# the container holds NO credentials — the DO owns all R2 access.
# -----------------------------------------------------------------------------
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Bind 0.0.0.0 so the DO's getTcpPort/containerFetch can reach it from outside the
# container netns (a 127.0.0.1 bind is unreachable there — same as ttyd/websockify).
HOST = "0.0.0.0"  # noqa: S104 — intentional; NOT in EXPOSE, DO-only (see SECURITY above)
PORT = 7070
HOME = "/home"  # back up/restore the contents of /home (all desktop users)
CHUNK = 64 * 1024  # 64 KiB stream copy — bounded memory regardless of size
LOG_PREFIX = "[deskl.ink backup-agent]"

# Single-flight: only ONE tar (backup OR restore) may run at a time. A second
# concurrent request gets 409 busy instead of forking another multi-GiB tar,
# which would risk OOM/DoS on a small container. Held for the whole stream.
_tar_lock = threading.Lock()


def log(msg):
    print(f"{LOG_PREFIX} {msg}", flush=True)


class Handler(BaseHTTPRequestHandler):
    # Quiet the default per-request stderr logging; we log the events we care about.
    def log_message(self, *_args):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        if self.path == "/backup":
            self._backup()
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path == "/restore":
            self._restore()
            return
        self._json(404, {"ok": False, "error": "not found"})

    def _backup(self):
        # Single-flight: refuse if a backup/restore is already streaming rather
        # than forking a second multi-GiB tar (OOM/DoS guard). Non-blocking.
        if not _tar_lock.acquire(blocking=False):
            log("backup: refused — another backup/restore is already running (409 busy)")
            self._json(409, {"ok": False, "error": "busy"})
            return
        try:
            # Stream `tar | gzip` straight to the socket in bounded chunks so an
            # arbitrarily large /home never buffers in memory.
            log("backup: streaming tar -C /home -czf - .")
            proc = subprocess.Popen(
                ["tar", "-C", HOME, "-czf", "-", "."],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.end_headers()
            try:
                assert proc.stdout is not None
                while True:
                    chunk = proc.stdout.read(CHUNK)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                # Caller hung up mid-stream — abandon the archive.
                proc.kill()
                proc.wait()
                log("backup: client disconnected mid-stream")
                return
            finally:
                if proc.stdout:
                    proc.stdout.close()
            rc = proc.wait()
            err = proc.stderr.read().decode("utf-8", "replace").strip() if proc.stderr else ""
            if rc != 0:
                # Headers (200) are already sent; the truncated body signals failure,
                # and we log the tar error. The DO verifies archive integrity on its end.
                log(f"backup: tar exited {rc} (archive may be incomplete): {err}")
            else:
                log("backup: tar completed ok")
        finally:
            _tar_lock.release()

    def _restore(self):
        # Single-flight: refuse if a backup/restore is already streaming rather
        # than forking a second multi-GiB tar (OOM/DoS guard). Non-blocking.
        if not _tar_lock.acquire(blocking=False):
            log("restore: refused — another backup/restore is already running (409 busy)")
            self._json(409, {"ok": False, "error": "busy"})
            return
        try:
            # Pipe the uploaded gzip tar straight into `tar -x` without buffering.
            length = self.headers.get("Content-Length")
            log(f"restore: extracting into {HOME} (Content-Length={length})")
            # HARDENING: the archive comes from R2 and is treated as UNTRUSTED.
            # GNU tar already strips a leading "/" and skips "../" members, but we
            # also pass --no-same-owner + --no-same-permissions so a malicious
            # archive cannot set file ownership (e.g. root:root) or modes
            # (setuid/setgid/world-writable) on extract — the DO owner is honored,
            # not the tar's stored metadata.
            proc = subprocess.Popen(
                ["tar", "--no-same-owner", "--no-same-permissions", "-C", HOME, "-xzf", "-"],
                stdin=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                assert proc.stdin is not None
                if length is not None:
                    remaining = int(length)
                    while remaining > 0:
                        chunk = self.rfile.read(min(CHUNK, remaining))
                        if not chunk:
                            break
                        proc.stdin.write(chunk)
                        remaining -= len(chunk)
                else:
                    # No length (chunked/unknown): copy until the client closes.
                    while True:
                        chunk = self.rfile.read(CHUNK)
                        if not chunk:
                            break
                        proc.stdin.write(chunk)
                proc.stdin.close()
            except (BrokenPipeError, ConnectionResetError, ValueError) as exc:
                proc.kill()
                proc.wait()
                log(f"restore: aborted copying body: {exc}")
                self._json(500, {"ok": False, "error": "body read failed"})
                return
            rc = proc.wait()
            err = proc.stderr.read().decode("utf-8", "replace").strip() if proc.stderr else ""
            if rc != 0:
                log(f"restore: tar exited {rc}: {err}")
                self._json(502, {"ok": False, "error": f"tar failed: {err}"})
                return
            log("restore: tar completed ok")
            self._json(200, {"ok": True})
        finally:
            _tar_lock.release()


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on http://{HOST}:{PORT} (0.0.0.0, no auth — DO caller only, not in EXPOSE)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
