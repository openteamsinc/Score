from typing import List, Optional
import requests
import click
import pandas as pd
import re
from bs4 import BeautifulSoup
from tqdm import tqdm
import logging

from ..utils.request_session import get_session

log = logging.getLogger(__name__)


def get_package_data(package_name) -> Optional[dict]:
    """
    Fetches package data by scraping the PyPI project page for a given package name.

    Args:
        package_name (str): The name of the package to fetch data for.

    Returns:
        dict: A dictionary containing filtered package data.
    """
    s = get_session()
    url = f"https://pypi.org/project/{package_name}/"
    response = s.get(url, timeout=5)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    # Extract the package summary
    summary_element = soup.find("p", class_="package-description__summary")
    summary = summary_element.text.strip() if summary_element else ""

    # Initialize package information dictionary
    package_info = {
        "name": package_name,
        "first_letter": package_name[0],
        "version": soup.find("h1").text.strip().split()[-1],  # type: ignore
        "summary": summary,
        "author": "",
        "license": "",
        "maintainer": "",
        "maintainer_email": "",
        "requires": "",
        "dev_status": "",
        "first_release": "",
        "last_release": "",
        "releases": [],
        "monthly_downloads_pypi": "",
        "monthly_downloads_conda": "",
    }

    # Extract meta information from the sidebar section
    meta_section = None
    sidebar_sections = soup.find_all("div", class_="sidebar-section")
    for section in sidebar_sections:
        heading = section.find("h6")
        if heading and heading.text.strip().lower() == "meta":
            meta_section = section
            break

    if meta_section:
        for p in meta_section.find_all("p"):
            strong = p.find("strong")
            if strong:
                label = strong.text.strip().lower()
                if "license" in label:
                    package_info["license"] = p.text.replace(strong.text, "").strip()
                elif "author" in label:
                    package_info["author"] = p.text.replace(strong.text, "").strip()
                elif "maintainer" in label:
                    maintainer_info = p.text.replace(strong.text, "").strip()
                    package_info["maintainer"] = maintainer_info
                    email_link = p.find("a", href=True)
                    if email_link and "mailto:" in email_link["href"]:
                        package_info["maintainer_email"] = (
                            email_link["href"].replace("mailto:", "").strip()
                        )
                elif "requires" in label:
                    package_info["requires"] = p.text.replace(strong.text, "").strip()

    # Extract classifiers (Development Status)
    classifiers_section = soup.find("ul", class_="sidebar-section__classifiers")
    if classifiers_section:
        for classifier in classifiers_section.find_all("li"):  # type: ignore
            text = classifier.text.strip()
            if "Development Status" in text:
                package_info["dev_status"] = text

    # Extract release history
    extract_release_history(url, soup, package_info)

    # Extract monthly downloads from image URLs based on alt text
    images = soup.find_all("img")
    for img in images:
        alt_text = img.get("alt", "")
        src = img.get("src", "")
        if "PyPI Downloads" in alt_text:
            package_info["monthly_downloads_pypi"] = extract_downloads_from_svg(src)
        elif "Conda Downloads" in alt_text:
            package_info["monthly_downloads_conda"] = extract_downloads_from_svg(src)

    return package_info


def scrape_web(packages: List[str]) -> pd.DataFrame:

    all_package_data = []
    failed_count = 0
    for package_name in tqdm(packages, disable=None):
        package_data = get_package_data(package_name)
        if package_data:
            all_package_data.append(package_data)
        else:
            failed_count += 1

    click.echo(
        f"OK, Failed to fetch data for {failed_count} of {len(packages)} packages."
    )

    return pd.DataFrame(all_package_data)


def extract_downloads_from_svg(svg_url, retries=3, delay=2):
    """
    Extracts download numbers from an SVG image by parsing the SVG content.

    Args:
        svg_url (str): The URL of the SVG image.
        retries (int): The number of retry attempts if the request fails.
        delay (int): The delay between retry attempts.

    Returns:
        str: The extracted download number.
    """
    s = get_session(backoff_factor=1)
    response = s.get(svg_url, timeout=5)
    if response.status_code == 404:
        return ""
    if response.status_code == 502:
        log.error(
            f"502 - Failed to fetch SVG image: {svg_url}. "
            "This has a high probability to fail for at least one "
            "of the 30K pypi packages *even with 10 retries!*"
        )
        return ""
    response.raise_for_status()
    svg_content = response.text
    match = re.search(
        r"(\d[\d,]*[KM]?\s*/\s*month|\d[\d,]*[KM]?|\d+)\s*</text>", svg_content
    )
    if match:
        return match.group(1).replace(",", "").replace("/month", "")
    return ""


def extract_release_history(current_url, soup, package_info):
    """
    Extracts the release history for a given package from its PyPI project page.

    Args:
        current_url (str): The URL of the current package's project page.
        soup (BeautifulSoup): The BeautifulSoup object containing the parsed HTML of the project page.
        package_info (dict): The dictionary to store the extracted release history information.

    Returns:
        None
    """
    try:
        # Find the link to the history section
        history_link = soup.find("a", id="history-tab")
        if not history_link:
            return

        # Construct the full URL to the history section
        history_url = (
            f"{current_url.rstrip('/')}/{history_link.get('href').lstrip('/')}"
        )

        # Fetch the history page
        response = requests.get(history_url, timeout=10)
        response.raise_for_status()
        history_soup = BeautifulSoup(response.text, "html.parser")

        # Find the history section in the fetched HTML
        releases_section = history_soup.find("div", {"id": "history"})
        if not releases_section:
            return

        # Find all release cards within the history section
        release_cards = releases_section.find_all("a", class_="card release__card")  # type: ignore

        # Initialize a list to hold the release history information
        release_history = []
        for card in release_cards:
            # Extract the release version and release date elements
            release_version_element = card.find("p", class_="release__version")
            release_date_element = card.find("p", class_="release__version-date")

            if release_version_element and release_date_element:
                # Extract the datetime element within the release date element
                release_date_time_element = release_date_element.find("time")
                if release_date_time_element:
                    release_version = release_version_element.text.strip()
                    release_date = release_date_time_element["datetime"]
                    release_info = {"version": release_version, "date": release_date}
                    release_history.append(release_info)

        # Update the package_info dictionary with the release history
        package_info["releases"] = release_history
        if release_history:
            # Set the first and last release dates in the package_info dictionary
            package_info["first_release"] = release_history[-1]["date"]
            package_info["last_release"] = release_history[0]["date"]

    except Exception as e:
        log.error(f"Failed to extract release history: {e}")
