import logging
from datetime import datetime
from typing import List

import pandas as pd
from tqdm import tqdm

from ..utils.request_session import get_session

log = logging.getLogger(__name__)

current_date = datetime.now().strftime("%Y-%m-%d")

NPM_PACKAGE_TEMPLATE_URL = "https://registry.npmjs.org/{package_name}"
NPM_PACKAGE_DOWNLOAD_URL = (
    "https://api.npmjs.org/downloads/range/2000-01-01:{current_date}/{package_name}"
)


def get_npm_package_downloads(package_name: str) -> int:
    s = get_session()
    downloads_url = NPM_PACKAGE_DOWNLOAD_URL.format(
        current_date=current_date, package_name=package_name
    )
    downloads_res = s.get(downloads_url)
    if downloads_res.status_code == 404:
        log.debug(
            f"Skipping download data package not found for package {package_name}"
        )
        return 0
    downloads_res.raise_for_status()
    downloads_data = downloads_res.json()
    total_downloads = sum(day["downloads"] for day in downloads_data["downloads"])
    ndownloads = total_downloads if total_downloads else 0
    return ndownloads


def normalize_repository_url(url: str) -> str:
    if not url:
        return None

    # Handle different URL schemes
    if url.startswith("git+https://"):
        url = url.replace("git+https://", "https://")
    elif url.startswith("git:"):
        url = url.replace("git:", "https:")
    elif url.startswith("git+ssh://git@"):
        url = url.replace("git+ssh://git@", "https://")
    elif url.startswith("git@"):
        url = url.replace("git@", "https://")
    elif url.startswith("git://"):
        url = url.replace("git://", "https://")

    if url.startswith("https://") and ":" in url:
        url = url.replace(":", "/", 2).replace("https///", "https://")

    return url


def scrape_npm(package_names: List[str]) -> pd.DataFrame:
    """
    Scrape NPM package data for a list of package names.

    Args:
        package_names (List[str]): A list of package names to scrape data for.

    Returns:
        pd.DataFrame: A DataFrame containing metadata for each package. The DataFrame includes the following fields:

        - `name` (str): The name of the package.
        - `full_name` (str): The full name of the package.
        - `source_url` (Optional[str]): The URL to the source code repository, if available.
        - `latest_version` (str): The latest version of the package.
        - `ndownloads` (int): The total number of downloads for the package.
        - `maintainers_count` (int): The number of maintainers for the package.
    """
    s = get_session()
    all_packages = []
    for package in tqdm(package_names, disable=None):
        url = NPM_PACKAGE_TEMPLATE_URL.format(package_name=package)
        res = s.get(url)
        if res.status_code == 404:
            log.debug(f"Skipping package not found for package {package}")
            continue
        res.raise_for_status()
        package_data = res.json()

        repository = package_data.get("repository", None)
        source_url = (
            normalize_repository_url(repository.get("url"))
            if isinstance(repository, dict)
            else None
        )

        if source_url is None:
            continue

        ndownloads = get_npm_package_downloads(package)
        maintainers_count = (
            len(package_data.get("maintainers", [])) if package_data else 0
        )
        all_packages.append(
            {
                "name": package,
                "full_name": package_data.get("name"),
                "source_url": source_url,
                "latest_version": package_data.get("dist-tags", {}).get("latest"),
                "ndownloads": ndownloads,
                "maintainers_count": maintainers_count,
            }
        )

    return pd.DataFrame(all_packages)
