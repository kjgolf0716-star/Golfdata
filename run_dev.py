import os

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8766))
    uvicorn.run("main:app", host="127.0.0.1", port=port)
