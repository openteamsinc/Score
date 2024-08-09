import os
import pandas as pd
import requests
from tqdm import tqdm
import logging
from ..utils.common import extract_and_map_fields

log = logging.getLogger(__name__)

# Constants
GITHUB_API_URL = "https://api.github.com/repos/"
AUTH_HEADER = {"Authorization": f"token {os.getenv('GITHUB_TOKEN', '')}"}

# Fields to extract from the GitHub API response
FIELDS_TO_EXTRACT = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "pushed_at": "pushed_at",
    "stargazers_count": "stargazers_count",
    "forks_count": "forks_count",
    "open_issues_count": "open_issues_count",
    "subscribers_count": "subscribers_count",
    "watchers_count": "watchers_count",
    "contributors_url": "contributors_url",
    "license.name": "license",
}


def fetch_github_data(repo_url):
    """
    Fetches data from the GitHub API for a given repository URL and extracts specified fields.
    Handles cases where the repository is not found (404 error) and returns a record indicating the URL is broken.

    Args:
        repo_url (str): The GitHub repository URL.

    Returns:
        dict: A dictionary containing the extracted data fields or an indication that the URL is broken.
    """
    repo_name = "/".join(repo_url.split("/")[-2:])
    response = requests.get(GITHUB_API_URL + repo_name, headers=AUTH_HEADER)

    if response.status_code == 404:
        log.debug(f"Repository not found for URL {repo_url}")
        return {"source_url": repo_url, "broken_url": True, "error": "404 Not Found"}

    response.raise_for_status()  # Raise an error for bad status codes
    data = response.json()

    # Use the extract_and_map_fields function to map the desired fields
    extracted_data = extract_and_map_fields(data, map=FIELDS_TO_EXTRACT)

    # Fetch additional details for contributors
    if contributors_url := data.get("contributors_url"):
        contributors_response = requests.get(contributors_url, headers=AUTH_HEADER)
        if contributors_response.status_code == 200:
            contributors = contributors_response.json()
            extracted_data["contributors"] = contributors
            extracted_data["contributors_count"] = len(contributors)
        else:
            log.debug(f"Failed to fetch contributors for URL {repo_url}")

    # Drop the contributors_url from extracted_data if it exists
    extracted_data.pop("contributors_url", None)

    # Ensure the source_url is always included in the data
    extracted_data["source_url"] = repo_url
    extracted_data["broken_url"] = False

    return extracted_data


def scrape_github_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Initiates the scraping process using the GitHub API for the provided DataFrame.

    Args:
        df (pd.DataFrame): A DataFrame containing the GitHub URLs.

    Returns:
        pd.DataFrame: A DataFrame containing the scraped data.
    """

    if df.empty:
        log.debug("No valid GitHub URLs found in the input file")
        return pd.DataFrame()

    all_repo_data = []

    # Iterate over the DataFrame rows and fetch data from GitHub API
    for _, row in tqdm(df.iterrows(), total=len(df), desc="Processing GitHub URLs"):
        source_url = row.get("source_url")  # Use .get() to safely access the value
        if source_url:  # Check if source_url is not None or empty
            data = fetch_github_data(source_url)
            if data:
                all_repo_data.append(data)
        else:
            log.debug(f"Skipping row with missing source_url: {row}")

    return pd.DataFrame(all_repo_data)
