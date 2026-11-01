"""
ws_server.py
Mengirim pose ke viewer di browser secara real-time lewat WebSocket.

Kenapa pakai thread terpisah? Loop OpenCV di main.py berjalan terus-menerus (sinkron),
sedangkan server WebSocket butuh event loop asyncio. Supaya keduanya tidak saling
menunggu, server dijalankan di thread sendiri, lalu main.py cukup memanggil send().
"""

import asyncio
import json
import threading

from websockets.asyncio.server import serve


class PoseBroadcaster:
    def __init__(self, host="localhost", port=8765):
        self.host = host
        self.port = port
        self.clients = set()
        self.loop = None
        self.thread = None

    async def _handler(self, websocket):
        # Dipanggil setiap ada browser yang tersambung.
        self.clients.add(websocket)
        print(f"[ws] viewer tersambung ({len(self.clients)} aktif)")
        try:
            await websocket.wait_closed()
        finally:
            self.clients.discard(websocket)
            print(f"[ws] viewer terputus ({len(self.clients)} aktif)")

    async def _main(self):
        async with serve(self._handler, self.host, self.port):
            print(f"[ws] server aktif di ws://{self.host}:{self.port}")
            await asyncio.Future()  # tunggu selamanya

    def _run(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._main())

    def start(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    async def _broadcast(self, message):
        for ws in list(self.clients):
            try:
                await ws.send(message)
            except Exception:
                self.clients.discard(ws)

    def send(self, data):
        """Dipanggil dari main.py. Aman dipanggil walau belum ada viewer tersambung."""
        if self.loop is None or not self.clients:
            return
        message = json.dumps(data)
        asyncio.run_coroutine_threadsafe(self._broadcast(message), self.loop)
