import config

import shutil
from functools import partial

from file_filters import filter_out_changed_files


def sync_build_to_githubio_dir():
    filter_out_changed_files_ = partial(
        filter_out_changed_files,
        orig_dir=config.BUILT_WEB,
        dest_dir=config.GITHUB_IO_DIR,
        fnames_to_ignore=config.FNAMES_TO_IGNORE_WHEN_SYNCING_BUILD_TO_WEB,
    )
    shutil.copytree(
        config.BUILT_WEB,
        config.GITHUB_IO_DIR,
        dirs_exist_ok=True,
        ignore=filter_out_changed_files_,
    )


if __name__ == "__main__":
    sync_build_to_githubio_dir()
