import base64
import io
import json
import sys

from pypdf import PdfReader


def main():
    payload = json.load(sys.stdin)
    encoded = payload.get("base64", "")
    if not encoded:
        json.dump({"text": "", "pageCount": 0}, sys.stdout)
        return
    raw = base64.b64decode(encoded)
    if not raw:
        json.dump({"text": "", "pageCount": 0}, sys.stdout)
        return
    reader = PdfReader(io.BytesIO(raw))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    text = "\n\n".join(pages).strip()
    json.dump({"text": text, "pageCount": len(reader.pages)}, sys.stdout)


if __name__ == "__main__":
    main()
