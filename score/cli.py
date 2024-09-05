import os
import pandas as pd
import click
import duckdb
from tqdm import tqdm

from .conda.get_conda_package_names import get_conda_package_names
from .conda.scrape_conda import scrape_conda
from .data_retrieval.json_scraper import scrape_json
from .data_retrieval.pypi_downloads import get_bulk_download_counts
from .logger import setup_logger
from .npm.get_npm_package_names import get_npm_package_names
from .npm.scrape_npm import scrape_npm
from .utils.get_pypi_package_list import get_pypi_package_names
from .vulnerabilities.scrape_vulnerabilities import scrape_vulnerabilities
from .git_vcs.get_git_urls import get_git_urls
from .git_vcs.scrape import scrape_git
from .score.maturity import build_maturity_score
from .score.health_risk import build_health_risk_score

OUTPUT_ROOT = os.environ.get("OUTPUT_ROOT", "./output")


partition_option = click.option(
    "-p",
    "--partition",
    default=lambda: os.environ.get("SCORE_PARTITION"),
    required=True,
    type=int,
    help="The partition number to process.",
)

num_partitions_option = click.option(
    "-n",
    "--num-partitions",
    required=True,
    default=lambda: os.environ.get("SCORE_NUM_PARTITIONS"),
    type=int,
    help="The number of partitions in total.",
)


@click.group()
def cli():
    setup_logger()
    os.environ.setdefault("GIT_TERMINAL_PROMPT", "0")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "pypi-json"),
    help="The output directory to save the scraped data in hive partition",
)
@partition_option
@num_partitions_option
def scrape_pypi(num_partitions, partition, output):
    packages = get_pypi_package_names(num_partitions, partition)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )

    df = scrape_json(packages)
    df["partition"] = partition

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "-o",
    "--output",
    default=os.path.join(OUTPUT_ROOT, "pypi-downloads.parquet"),
    help="The output path",
)
def scrape_pypi_downloads(output):
    click.echo(f"Fetching download data from BigQuery and saving into {output}")

    # Fetch the download data
    df = get_bulk_download_counts()

    # Save the DataFrame to the specified output with partitioning
    click.echo(f"Saving data to {output}")
    df.to_parquet(output)
    click.echo("Download data fetching and saving completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "conda"),
    help="The output directory to save the scraped data in hive partition",
)
@click.option(
    "-c",
    "--channel",
    default="conda-forge",
    help="The conda channel to scrape packages from",
)
@partition_option
@num_partitions_option
def conda(num_partitions, partition, output, channel):
    packages = get_conda_package_names(num_partitions, partition, channel)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )
    df = scrape_conda(channel, packages)
    df["partition"] = partition
    df["channel"] = channel

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["channel", "partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "vulnerabilities"),
    help="The output directory to save the scraped data in hive partition",
)
@click.option(
    "-e",
    "--ecosystem",
    default=os.environ.get("SCORE_ECOSYSTEM", "PyPI"),
    help="The ecosystem to scrape vulnerabilities for",
)
@partition_option
@num_partitions_option
def vulnerabilities(num_partitions, partition, output, ecosystem):
    if ecosystem == "PyPI":
        packages = get_pypi_package_names(num_partitions, partition)
    elif ecosystem == "npm":
        packages = get_npm_package_names(num_partitions, partition)
    else:
        raise ValueError(f"Unsupported ecosystem: {ecosystem}")
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )

    df = scrape_vulnerabilities(ecosystem, packages)
    df["partition"] = partition
    df["ecosystem"] = ecosystem

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["ecosystem", "partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "npm"),
    help="The output directory to save the scraped data in hive partition",
)
@partition_option
@num_partitions_option
def npm(num_partitions, partition, output):
    packages = get_npm_package_names(num_partitions, partition)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )
    df = scrape_npm(packages)
    df["partition"] = partition

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "-o",
    "--output",
    default=os.path.join(OUTPUT_ROOT, "source-urls.parquet"),
    help="The output path to save the aggregated data",
)
@click.option(
    "-i",
    "--input",
    default=OUTPUT_ROOT,
    help="The input directory to read the data from",
)
def agg_source_urls(input, output):
    click.echo("Aggregating data")

    db = duckdb.connect()
    # Public dataset / empty secret
    db.execute("CREATE SECRET (TYPE GCS);")

    df = db.query(
        f"""
        WITH pypi_sources AS (
        SELECT source_url FROM read_parquet('{input}/pypi-json/*/*.parquet')
        ),
        conda_sources AS (
        SELECT source_url FROM read_parquet('{input}/conda/*/*/*.parquet')
        )
        SELECT DISTINCT source_url
        FROM (
            SELECT source_url FROM pypi_sources
            UNION ALL
            SELECT source_url FROM conda_sources
        );
    """
    ).df()
    df.to_parquet(output)
    click.echo("Aggregation completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "git"),
    help="The output directory to save the scraped data in hive partition",
)
@click.option(
    "-i",
    "--input",
    default=os.path.join(OUTPUT_ROOT, "source-urls.parquet"),
    help="The output path to save the aggregated data",
)
@partition_option
@num_partitions_option
def git(input, num_partitions, partition, output):
    urls = get_git_urls(input, num_partitions, partition)
    click.echo(
        f"Will process {len(urls)} source urls in partition {partition} of {num_partitions}"
    )

    df = scrape_git(urls)
    df["partition"] = partition

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


def fmt_pypi(p):
    return {
        "name": p["name"],
        "version": p["version"],
        "ecosystem": "PyPI",
    }


def fmt_conda(p):
    return {
        "name": p["full_name"],
        "version": p["latest_version"],
        "ecosystem": "conda",
    }


@cli.command()
@click.option(
    "--git-input",
    default=os.path.join(OUTPUT_ROOT, "git"),
    help="The git input path to read the data from",
)
@click.option(
    "--pypi-input",
    default=os.path.join(OUTPUT_ROOT, "pypi-json"),
    help="The pypi input path to read the data from",
)
@click.option(
    "--conda-input",
    default=os.path.join(OUTPUT_ROOT, "conda"),
    help="The conda input path to read the data from",
)
@click.option(
    "-o",
    "--output",
    default=os.path.join(OUTPUT_ROOT, "score.parquet"),
    help="The output path to save the aggregated data",
)
def score(git_input, pypi_input, conda_input, output):

    db = duckdb.connect()
    db.execute("CREATE SECRET (TYPE GCS);")
    click.echo(f"Reading data from pypi {pypi_input} into memory")
    db.execute(
        f"""
    CREATE TABLE pypi AS
    SELECT name, version, source_url FROM read_parquet('{pypi_input}/*/*.parquet')
    """
    )
    click.echo(f"Reading data from conda {conda_input} into memory")
    db.execute(
        f"""
    CREATE TABLE conda AS
    SELECT full_name, latest_version, source_url FROM read_parquet('{conda_input}/*/*/*.parquet')
    """
    )

    # This has better handling than panadas read_parquet
    click.echo(f"Reading data from git {git_input} into memory")
    db.execute(
        f"""
    CREATE TABLE git AS
    select * from read_parquet('{git_input}/*/*.parquet')
    """
    )

    click.echo("Processing score")
    df = db.query(
        """
SELECT
    g.*,
    array(SELECT p FROM pypi as p WHERE p.source_url = g.source_url) AS pypi_packages,
    array(SELECT c FROM conda as c WHERE c.source_url = g.source_url) AS conda_packages
FROM
    git as g
WHERE
    g.source_url IS NOT NULL
    """
    ).df()
    df = df[~df.source_url.isna()]
    df.set_index("source_url", inplace=True)

    scores = []
    for source_url, row in tqdm(df.iterrows(), total=df.index.size):
        score: dict = {"source_url": source_url, "packages": []}
        scores.append(score)

        score["packages"].extend([fmt_pypi(p) for p in row.pypi_packages])
        score["packages"].extend([fmt_conda(c) for c in row.conda_packages])
        score["maturity"] = build_maturity_score(source_url, row)
        score["health_risk"] = build_health_risk_score(source_url, row)

    df = pd.DataFrame(scores)

    click.echo(f"Saving data to {output}")
    df.to_parquet(output)
    click.echo("Scraping completed.")


if __name__ == "__main__":
    cli()
