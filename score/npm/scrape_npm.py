from datetime import datetime
from typing import List

import pandas as pd
from tqdm import tqdm

from ..utils.request_session import get_session

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
    downloads_res.raise_for_status()
    downloads_data = downloads_res.json()
    total_downloads = sum(day["downloads"] for day in downloads_data["downloads"])
    ndownloads = total_downloads if total_downloads else 0
    return ndownloads


def scrape_npm(package_names: List[str]) -> pd.DataFrame:
    s = get_session()
    all_packages = []
    for package in tqdm(package_names, disable=None):
        url = NPM_PACKAGE_TEMPLATE_URL.format(package_name=package)
        res = s.get(url)
        res.raise_for_status()
        package_data = res.json()

        ndownloads = get_npm_package_downloads(package)
        maintainers_count = (
            len(package_data.get("maintainers", [])) if package_data else 0
        )

        all_packages.append(
            {
                "name": package,
                "full_name": package_data.get("package"),
                "source_url": package_data.get("repository", None)
                .get("url")
                .lstrip("git+"),
                "latest_version": package_data.get("dist-tags", {}).get("latest"),
                "ndownloads": ndownloads,
                "maintainers_count": maintainers_count,
            }
        )

    return pd.DataFrame(all_packages)