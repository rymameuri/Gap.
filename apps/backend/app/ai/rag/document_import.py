from __future__ import annotations

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from pydantic import BaseModel

from app.ai.rag.loaders import DocumentLoadError, EmptyDocumentError, load_document


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TEXT_LENGTH = 50_000
MAX_EXPANDED_BYTES = 100 * 1024 * 1024
SUPPORTED_SUFFIXES = {".pdf", ".docx", ".pptx", ".txt"}


class DocumentImportError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ImportedDocument(BaseModel):
    text: str
    section_count: int


def _check_office_archive(content: bytes, suffix: str) -> None:
    try:
        with ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 5000 or sum(e.file_size for e in entries) > MAX_EXPANDED_BYTES:
                raise DocumentImportError("document_too_large")
            expected = "word/document.xml" if suffix == ".docx" else "ppt/presentation.xml"
            if expected not in archive.namelist():
                raise DocumentImportError("invalid_document")
    except BadZipFile as exc:
        raise DocumentImportError("invalid_document") from exc


def extract_document(content: bytes, filename: str) -> ImportedDocument:
    """Extract a preview. This never changes the saved class or retrieval index."""
    if not filename or len(filename) > 200 or any(c in filename for c in ("/", "\\", "\x00")):
        raise DocumentImportError("invalid_document")
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentImportError("unsupported_type")
    if len(content) > MAX_UPLOAD_BYTES:
        raise DocumentImportError("document_too_large")
    if not content:
        raise DocumentImportError("empty_document")

    if suffix == ".txt":
        try:
            text = content.decode("utf-8-sig").strip()
        except UnicodeDecodeError as exc:
            raise DocumentImportError("invalid_text") from exc
        if "\x00" in text:
            raise DocumentImportError("invalid_text")
        section_count = 1
    else:
        if suffix in {".docx", ".pptx"}:
            _check_office_archive(content, suffix)
        if suffix == ".pdf" and b"%PDF-" not in content[:1024]:
            raise DocumentImportError("invalid_document")
        try:
            # Never use an uploaded filename as a filesystem path.
            with TemporaryDirectory(prefix="manara-import-") as directory:
                path = Path(directory) / ("document" + suffix)
                path.write_bytes(content)
                sections = load_document(path, "material-import")
            parts = []
            for section in sections:
                label = (
                    f"Page {section.page}\n" if section.page is not None
                    else f"Slide {section.slide}\n" if section.slide is not None
                    else ""
                )
                parts.append(label + section.text)
            text = "\n\n".join(parts).strip()
            section_count = len(sections)
        except EmptyDocumentError as exc:
            raise DocumentImportError("empty_document") from exc
        except DocumentLoadError as exc:
            code = "encrypted_document" if "Password-protected" in str(exc) else "invalid_document"
            raise DocumentImportError(code) from exc

    if len(text.strip()) < 10:
        raise DocumentImportError("empty_document")
    # Match the JavaScript editor and API's UTF-16 string length limit.
    if len(text.encode("utf-16-le")) // 2 > MAX_TEXT_LENGTH:
        raise DocumentImportError("text_too_long")
    return ImportedDocument(text=text, section_count=section_count)
