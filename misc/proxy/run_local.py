import os
from uvicorn import Config, Server

os.environ.setdefault("UPSTREAM_BASE", "https://pro.edgex.exchange")
os.environ.setdefault("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173")
os.environ.setdefault("LOG_LEVEL", "info")

if __name__ == "__main__":
    server = Server(Config("server:app", host="0.0.0.0", port=8000, reload=True))
    server.run()
