"""Turn Gmail message resources into plain data, and build plain-text reply MIME."""

import base64
import email.policy
import email.utils
import re
from email.message import EmailMessage
from html.parser import HTMLParser

MAX_BODY_CHARS = 20000
HIDDEN_OPEN = "[[TEXTE MASQUÉ DANS LE HTML — non fiable : "
HIDDEN_CLOSE = "]]"
SUMMARY_HEADERS = ("From", "To", "Cc", "Reply-To", "Subject", "Date")
THREADING_HEADERS = ("Message-ID", "In-Reply-To", "References")

_SKIP_TAGS = {"script", "style", "head", "title", "noscript", "template", "svg", "object", "iframe"}
_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
_BLOCK_TAGS = {"p", "div", "br", "tr", "li", "ul", "ol", "table", "h1", "h2", "h3", "h4", "h5", "h6",
               "blockquote", "section", "article", "header", "footer", "pre", "hr"}
_HIDDEN_STYLE = re.compile(
    r"display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d]*[1-9])|opacity\s*:\s*0(?![.\d]*[1-9])"
    r"|max-height\s*:\s*0(?![.\d]*[1-9])|mso-hide\s*:\s*all",
    re.I,
)


def _is_hidden(attrs):
    values = dict(attrs)
    if "hidden" in values or values.get("aria-hidden") == "true":
        return True
    return bool(_HIDDEN_STYLE.search(values.get("style") or ""))


class _TextExtractor(HTMLParser):
    """Keeps visible text, wraps hidden text in explicit markers, drops scripts and images."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.stack = []  # (tag, hidden, skip)

    def _hidden(self):
        return any(item[1] for item in self.stack)

    def _skipping(self):
        return any(item[2] for item in self.stack)

    def handle_starttag(self, tag, attrs):
        if tag in _BLOCK_TAGS:
            self.out.append(("text", "\n", False))
        if tag in _VOID_TAGS:
            return
        self.stack.append((tag, _is_hidden(attrs), tag in _SKIP_TAGS))

    def handle_startendtag(self, tag, attrs):
        if tag in _BLOCK_TAGS:
            self.out.append(("text", "\n", False))

    def handle_endtag(self, tag):
        if tag in _BLOCK_TAGS:
            self.out.append(("text", "\n", False))
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        if self._skipping() or not data:
            return
        self.out.append(("text", data, self._hidden()))

    def text(self):
        parts, hidden_run = [], []

        def flush_hidden():
            joined = re.sub(r"\s+", " ", "".join(hidden_run)).strip()
            if joined:
                parts.append(f" {HIDDEN_OPEN}{joined}{HIDDEN_CLOSE} ")
            hidden_run.clear()

        for _, data, hidden in self.out:
            if hidden:
                hidden_run.append(data)
            else:
                flush_hidden()
                parts.append(data)
        flush_hidden()
        text = "".join(parts)
        text = re.sub(r"[ \t\f\v ]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        return re.sub(r"\n{3,}", "\n\n", text).strip()


def html_to_text(html):
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    return parser.text()


def _decode(data, charset):
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    try:
        return raw.decode(charset or "utf-8", errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def _charset(part):
    for header in part.get("headers") or []:
        if header.get("name", "").lower() == "content-type":
            match = re.search(r'charset="?([A-Za-z0-9_.:-]+)"?', header.get("value", ""), re.I)
            if match:
                return match.group(1)
    return "utf-8"


def _is_attachment(part):
    if part.get("filename"):
        return True
    for header in part.get("headers") or []:
        if header.get("name", "").lower() == "content-disposition" and header.get("value", "").lower().startswith("attachment"):
            return True
    return False


def _walk(part, plain, html, attachments):
    mime_type = (part.get("mimeType") or "").lower()
    if _is_attachment(part):
        attachments.append({
            "filename": part.get("filename") or "(sans nom)",
            "mime_type": mime_type,
            "size": (part.get("body") or {}).get("size", 0),
        })
        return
    data = (part.get("body") or {}).get("data")
    if mime_type == "text/plain" and data:
        plain.append(_decode(data, _charset(part)))
    elif mime_type == "text/html" and data:
        html.append(_decode(data, _charset(part)))
    for child in part.get("parts") or []:
        _walk(child, plain, html, attachments)


def headers_of(message, names):
    wanted = {name.lower(): name for name in names}
    found = {}
    for header in (message.get("payload") or {}).get("headers") or []:
        key = wanted.get(header.get("name", "").lower())
        if key and key not in found:
            found[key] = header.get("value", "")
    return {name: found[name] for name in names if name in found}


def parse_message(message, include_body=True):
    """Gmail message resource (format=full) -> headers, plain-text body, attachment names."""
    result = {
        "message_id": message.get("id"),
        "labels": message.get("labelIds") or [],
        "is_draft": "DRAFT" in (message.get("labelIds") or []),
        "headers": headers_of(message, SUMMARY_HEADERS + THREADING_HEADERS),
    }
    if not include_body:
        return result
    plain, html, attachments = [], [], []
    _walk(message.get("payload") or {}, plain, html, attachments)
    if plain:
        body, source = "\n\n".join(plain), "text/plain"
    elif html:
        body, source = html_to_text("\n".join(html)), "text/html (converti, images et scripts retirés)"
    else:
        body, source = "", "aucun texte"
    truncated = len(body) > MAX_BODY_CHARS
    result.update({
        "body_text": body[:MAX_BODY_CHARS],
        "body_source": source,
        "body_truncated": truncated,
        "attachments": attachments,
    })
    return result


def addresses(header_values):
    return [addr.lower() for _, addr in email.utils.getaddresses(header_values) if "@" in addr]


_ADDR = re.compile(r"^[^@\s<>,;\"]+@[^@\s<>,;\"]+\.[^@\s<>,;\"]+$")


def parse_recipient(value):
    """'a@b.c' or 'Name <a@b.c>' -> (name, address). Raises ValueError otherwise."""
    if not isinstance(value, str) or "\n" in value or "\r" in value or len(value) > 320:
        raise ValueError("destinataire invalide")
    name, addr = email.utils.parseaddr(value)
    if not _ADDR.match(addr or ""):
        raise ValueError(f"adresse invalide : {value}")
    return name, addr.lower()


def reply_subject(subject):
    subject = re.sub(r"[\r\n]+", " ", subject or "").strip()
    if re.match(r"^(re|aw|sv|antw|ref|réf)\s*:", subject, re.I):
        return subject
    return f"Re: {subject}" if subject else "Re:"


def references_for(parent_references, parent_message_id):
    ids = re.findall(r"<[^<>\s]+>", parent_references or "")
    if parent_message_id not in ids:
        ids.append(parent_message_id)
    return " ".join(ids[-20:])


def build_reply(to, cc, subject, in_reply_to, references, body):
    """Plain-text only: no HTML, so no remote image or tracking pixel can be carried."""
    message = EmailMessage(policy=email.policy.SMTP)
    message["To"] = ", ".join(email.utils.formataddr(item) for item in to)
    if cc:
        message["Cc"] = ", ".join(email.utils.formataddr(item) for item in cc)
    message["Subject"] = subject
    message["In-Reply-To"] = in_reply_to
    message["References"] = references
    message.set_content(body, subtype="plain", charset="utf-8")
    return base64.urlsafe_b64encode(message.as_bytes()).decode()


def normalize_body(text):
    return "\n".join(line.rstrip() for line in (text or "").replace("\r\n", "\n").split("\n")).strip()
