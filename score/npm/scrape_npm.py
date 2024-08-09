from typing import List
import pandas as pd
from tqdm import tqdm

from ..utils.request_session import get_session

NPM_PACKAGE_URL = ""


def scrape_npm(package_names: List[str]) -> pd.DataFrame:
    s = get_session()
    all_packages = []
    for package in tqdm(package_names, disable=None):
        url = NPM_PACKAGE_URL
        res = s.get(url)
        res.raise_for_status()
        package_data = res.json()
        print(package_data)

        all_packages.append({})

    return pd.DataFrame(all_packages)
