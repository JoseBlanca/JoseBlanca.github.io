from pathlib import Path
import sys

BASE_DIR = Path(__file__).parent.parent.resolve()

JBLANCA_MKDOCS_WEB_SOURCE_DIR = BASE_DIR / "web_root_mkdocs_source"
GITHUB_IO_DIR = BASE_DIR / "JoseBlanca.github.io"
TMP_DIR = BASE_DIR / "tmp"
BUILT_WEB = BASE_DIR / "built_web"

FNAMES_TO_IGNORE_WHEN_SYNCING_BUILD_TO_WEB = [".DS_Store"]

if sys.platform == "linux":
    OFICIO_DUDA_DIR = Path("../arte_duda").resolve()
else:
    OFICIO_DUDA_DIR = Path("/Users/jose/libros/el_arte_de_la_duda/")
OFICIO_DUDA_BUILD_SCRIPT = OFICIO_DUDA_DIR / "building_scripts/build_oficio.py"

OFICIO_DUDA_MKDOC_DIR_SUBPATH = Path("docs/el_oficio_de_la_duda")
OFICIO_DUDA_GITHUB_DIR = GITHUB_IO_DIR / "el_oficio_de_la_duda"
OFICIO_DUDA_MKDOC_ONLINE_READ_DIR_SUBPATH = OFICIO_DUDA_MKDOC_DIR_SUBPATH / "leer"
OFICIO_DUDA_FILES_DIR_SUBPTAH = OFICIO_DUDA_MKDOC_DIR_SUBPATH / "files"
OFICIO_DUDA_MKDOC_EPUB_SUBPATH = (
    OFICIO_DUDA_FILES_DIR_SUBPTAH / "el_oficio_de_la_duda.epub"
)
OFICIO_DUDA_MKDOC_MOBI_SUBPATH = (
    OFICIO_DUDA_FILES_DIR_SUBPTAH / "el_oficio_de_la_duda.mobi"
)
OFICIO_DUDA_MKDOC_PDF_SUBPATH = (
    OFICIO_DUDA_FILES_DIR_SUBPTAH / "el_oficio_de_la_duda.pdf"
)
OFICIO_DUDA_MKDOC_AZW3_SUBPATH = (
    OFICIO_DUDA_FILES_DIR_SUBPTAH / "el_oficio_de_la_duda.azw3"
)
