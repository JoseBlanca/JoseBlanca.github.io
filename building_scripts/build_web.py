import config
from pathlib import Path
import tempfile
import shutil
from subprocess import run

from ebook_building import format_transformations


def build_mkdocs_web(mkdocs_src_dir, dest_dir):
    cmd = ["mkdocs", "build", "-d", str(dest_dir)]
    run(cmd, check=True, cwd=mkdocs_src_dir)


def build_oficio_duda_epub(epub_path):
    cmd = ["python", str(config.OFICIO_DUDA_BUILD_SCRIPT), "epub", str(epub_path)]
    run(cmd, check=True)


def build_oficio_duda_online_book(web_path):
    cmd = ["python", str(config.OFICIO_DUDA_BUILD_SCRIPT), "web", str(web_path)]
    run(cmd, check=True)


if __name__ == "__main__":
    TMP_DIR = config.TMP_DIR
    TMP_DIR.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(
        dir=TMP_DIR, prefix="jblanca_mkdocs_source_"
    ) as tmp_src_dir:
        tmp_dir_path = Path(tmp_src_dir)
        shutil.copytree(
            config.JBLANCA_MKDOCS_WEB_SOURCE_DIR, tmp_dir_path, dirs_exist_ok=True
        )

        oficio_duda_files_dir = tmp_dir_path / config.OFICIO_DUDA_FILES_DIR_SUBPTAH
        oficio_duda_files_dir.mkdir(exist_ok=True)
        oficio_duda_mkdocs_epub_path = (
            tmp_dir_path / config.OFICIO_DUDA_MKDOC_EPUB_SUBPATH
        )
        build_oficio_duda_epub(oficio_duda_mkdocs_epub_path)

        oficio_duda_mkdocs_mobi_path = (
            tmp_dir_path / config.OFICIO_DUDA_MKDOC_MOBI_SUBPATH
        )
        format_transformations.epub_to_mobi(
            oficio_duda_mkdocs_epub_path, oficio_duda_mkdocs_mobi_path
        )

        oficio_duda_mkdocs_pdf_path = (
            tmp_dir_path / config.OFICIO_DUDA_MKDOC_PDF_SUBPATH
        )
        format_transformations.epub_to_pdf(
            oficio_duda_mkdocs_epub_path, oficio_duda_mkdocs_pdf_path
        )

        oficio_duda_mkdocs_azw3_path = (
            tmp_dir_path / config.OFICIO_DUDA_MKDOC_AZW3_SUBPATH
        )
        format_transformations.epub_to_azw3(
            oficio_duda_mkdocs_epub_path, oficio_duda_mkdocs_azw3_path
        )

        oficio_duda_mkdocs_read_web_path = (
            tmp_dir_path / config.OFICIO_DUDA_MKDOC_ONLINE_READ_DIR_SUBPATH
        )
        build_oficio_duda_online_book(oficio_duda_mkdocs_read_web_path)

        build_mkdocs_web(mkdocs_src_dir=tmp_src_dir, dest_dir=config.BUILT_WEB)
