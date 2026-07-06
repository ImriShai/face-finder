import os
import zipfile

import pytest
from PIL import Image

from app.storage.storage_service import (
    _is_safe_zip_member,
    create_thumbnail,
    extract_zip,
    sanitize_filename,
)


class TestSanitizeFilename:
    def test_strips_directory_components(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"
        assert sanitize_filename("/absolute/path/file.jpg") == "file.jpg"

    def test_replaces_dangerous_characters(self):
        result = sanitize_filename("my file (1).jpg")
        assert " " not in result
        assert "(" not in result

    def test_preserves_extension(self):
        assert sanitize_filename("photo.jpeg").endswith(".jpeg")

    def test_limits_length(self):
        long_name = "a" * 300 + ".jpg"
        assert len(sanitize_filename(long_name)) <= 200


class TestZipSlipGuard:
    def test_safe_member_is_allowed(self, tmp_path):
        assert _is_safe_zip_member("photo.jpg", str(tmp_path)) is True

    def test_traversal_is_blocked(self, tmp_path):
        assert _is_safe_zip_member("../outside.jpg", str(tmp_path)) is False
        assert _is_safe_zip_member("../../etc/passwd", str(tmp_path)) is False


class TestExtractZip:
    def _make_zip(self, tmp_path, entries: dict[str, bytes]) -> str:
        zip_path = str(tmp_path / "test.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for name, data in entries.items():
                zf.writestr(name, data)
        return zip_path

    def test_extracts_image_files(self, tmp_path):
        img_bytes = self._jpeg_bytes()
        zip_path = self._make_zip(tmp_path, {"photo.jpg": img_bytes})
        out_dir = str(tmp_path / "out")

        result = extract_zip(zip_path, out_dir)

        assert len(result) == 1
        assert result[0].endswith("photo.jpg")

    def test_skips_non_image_files(self, tmp_path):
        zip_path = self._make_zip(tmp_path, {"readme.txt": b"hello", "script.exe": b"MZ"})
        out_dir = str(tmp_path / "out")
        assert extract_zip(zip_path, out_dir) == []

    def test_blocks_zip_slip(self, tmp_path):
        zip_path = self._make_zip(tmp_path, {"../escape.jpg": b"data"})
        out_dir = str(tmp_path / "out")
        result = extract_zip(zip_path, out_dir)
        assert result == []

    def test_handles_name_collisions(self, tmp_path):
        img = self._jpeg_bytes()
        zip_path = self._make_zip(tmp_path, {"a.jpg": img, "sub/a.jpg": img})
        out_dir = str(tmp_path / "out")
        result = extract_zip(zip_path, out_dir)
        assert len(result) == 2
        assert len({os.path.basename(p) for p in result}) == 2

    @staticmethod
    def _jpeg_bytes() -> bytes:
        import io
        buf = io.BytesIO()
        Image.new("RGB", (10, 10), "red").save(buf, "JPEG")
        return buf.getvalue()


class TestCreateThumbnail:
    def test_creates_thumbnail_at_dest(self, tmp_path):
        src = str(tmp_path / "src.png")
        dst = str(tmp_path / "thumbs" / "t.jpg")
        Image.new("RGB", (800, 600), "blue").save(src)

        create_thumbnail(src, dst, size=(200, 200))

        assert os.path.exists(dst)
        with Image.open(dst) as img:
            assert img.width <= 200
            assert img.height <= 200

    def test_creates_parent_directory(self, tmp_path):
        src = str(tmp_path / "src.png")
        dst = str(tmp_path / "deep" / "nested" / "thumb.jpg")
        Image.new("RGB", (50, 50)).save(src)

        create_thumbnail(src, dst)

        assert os.path.exists(dst)
